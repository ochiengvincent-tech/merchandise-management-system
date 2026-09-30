import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";
import { purchaseOrderReceiptRequests } from "../../db/schema/purchase-order-receipt-requests.js";
import { AppError } from "../../errors/app-error.js";

import { createProcurementAuditLogService } from "../audit/procurement-audit-service.js";
import { createOutboxEvent } from "../events/outbox-service.js";

import { updatePurchaseOrderWithDatabase } from "../purchase-orders/purchase-order-repository.js";

import { findPurchaseOrderLinesWithDatabase } from "../purchase-orders/purchase-order-line-repository.js";

import { updatePurchaseOrderLineReceivedQuantityWithDatabase } from "./purchase-order-receipt-repository.js";

type ReceiptItem = {
  purchaseOrderLineId: string;
  quantityReceived: number;
};

export async function receivePurchaseOrder(
  id: string,
  items: ReceiptItem[],
  actorId: string,
  receivingReceiptId?: string,
) {
  const normalizedItems = [...items].sort((left, right) =>
    left.purchaseOrderLineId.localeCompare(right.purchaseOrderLineId),
  );
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ id, items: normalizedItems }))
    .digest("hex");

  if (receivingReceiptId) {
    const [savedRequest] = await db
      .select()
      .from(purchaseOrderReceiptRequests)
      .where(
        eq(
          purchaseOrderReceiptRequests.receivingReceiptId,
          receivingReceiptId,
        ),
      )
      .limit(1);

    if (savedRequest) {
      if (savedRequest.requestHash !== requestHash) {
        throw new AppError(
          "Receiving receipt ID was already used with different receipt data",
          409,
        );
      }

      return savedRequest.response as {
        purchaseOrder: unknown;
        lines: unknown[];
      };
    }
  }

  if (items.length === 0) {
    throw new AppError("At least one receipt item is required", 400);
  }

  for (const item of items) {
    if (item.quantityReceived <= 0) {
      throw new AppError("Received quantity must be greater than zero", 400);
    }
  }

  return db.transaction(async (tx) => {
    const [existingPurchaseOrder] = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .for("update")
      .limit(1);

    if (!existingPurchaseOrder) {
      throw new AppError("Purchase order not found", 404);
    }

    if (receivingReceiptId) {
      const [savedRequest] = await tx
        .select()
        .from(purchaseOrderReceiptRequests)
        .where(
          eq(
            purchaseOrderReceiptRequests.receivingReceiptId,
            receivingReceiptId,
          ),
        )
        .limit(1);

      if (savedRequest) {
        if (savedRequest.requestHash !== requestHash) {
          throw new AppError(
            "Receiving receipt ID was already used with different receipt data",
            409,
          );
        }
        return savedRequest.response as {
          purchaseOrder: unknown;
          lines: unknown[];
        };
      }
    }

    if (
      existingPurchaseOrder.status !== "SENT" &&
      existingPurchaseOrder.status !== "PARTIALLY_RECEIVED"
    ) {
      throw new AppError(
        "Purchase order cannot receive goods in its current state",
        409,
      );
    }

    const purchaseOrderLines = await findPurchaseOrderLinesWithDatabase(id, tx);
    const lineMap = new Map(purchaseOrderLines.map((line) => [line.id, line]));
    const seenLineIds = new Set<string>();

    for (const item of items) {
      if (seenLineIds.has(item.purchaseOrderLineId)) {
        throw new AppError(
          "A purchase order line cannot appear more than once in a receipt",
          400,
        );
      }
      seenLineIds.add(item.purchaseOrderLineId);

      const line = lineMap.get(item.purchaseOrderLineId);
      if (!line) throw new AppError("Purchase order line not found", 404);
      if (line.quantityReceived + item.quantityReceived > line.quantityOrdered) {
        throw new AppError(
          "Received quantity cannot exceed ordered quantity",
          409,
        );
      }
    }

    const updatedLines = [];

    for (const item of items) {
      const line = lineMap.get(item.purchaseOrderLineId);

      if (!line) {
        throw new Error("Purchase order line not found");
      }

      const newQuantityReceived = line.quantityReceived + item.quantityReceived;

      const updatedLine =
        await updatePurchaseOrderLineReceivedQuantityWithDatabase(
          line.id,
          newQuantityReceived,
          tx,
        );

      if (!updatedLine) {
        throw new Error("Failed to update purchase order line");
      }

      updatedLines.push(updatedLine);
    }

    const allLines = purchaseOrderLines.map((line) => {
      const receivedItem = items.find(
        (item) => item.purchaseOrderLineId === line.id,
      );

      if (!receivedItem) {
        return line;
      }

      return {
        ...line,
        quantityReceived: line.quantityReceived + receivedItem.quantityReceived,
      };
    });

    const isCompleted = allLines.every(
      (line) => line.quantityReceived === line.quantityOrdered,
    );

    const newStatus = isCompleted ? "COMPLETED" : "PARTIALLY_RECEIVED";

    const purchaseOrder = await updatePurchaseOrderWithDatabase(
      id,
      {
        status: newStatus,
      },
      tx,
    );

    if (!purchaseOrder) {
      throw new Error("Failed to update purchase order status");
    }

    await createProcurementAuditLogService(
      {
        purchaseOrderId: purchaseOrder.id,
        action: "PO_RECEIPT_UPDATED",
        actorId,
        beforeState: {
          ...existingPurchaseOrder,
          lines: purchaseOrderLines,
        },
        afterState: {
          ...purchaseOrder,
          lines: allLines,
        },
      },
      tx,
    );

    if (receivingReceiptId) {
      const response = { purchaseOrder, lines: updatedLines };
      await tx.insert(purchaseOrderReceiptRequests).values({
        receivingReceiptId,
        requestHash,
        response,
      });
      return response;
    }

    const outboxEvent = await createOutboxEvent(
      {
        eventId: crypto.randomUUID(),
        eventType: "PurchaseOrderReceived",
        aggregateType: "PurchaseOrder",
        aggregateId: purchaseOrder.id,
        payload: {
          purchaseOrderId: purchaseOrder.id,
          lines: updatedLines.map((line) => {
            const receivedItem = items.find(
              (item) => item.purchaseOrderLineId === line.id,
            );

            if (!receivedItem) {
              throw new Error(
                "Received item not found for updated purchase order line",
              );
            }

            return {
              productId: line.productId,
              locationId: purchaseOrder.destinationLocationId,
              quantityReceived: receivedItem.quantityReceived,
              unitPrice: line.unitPrice,
            };
          }),
        },
      },
      tx,
    );

    if (!outboxEvent) {
      throw new Error("Failed to create purchase order received outbox event");
    }

    return { purchaseOrder, lines: updatedLines };
  });
}

import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";

import { createProcurementAuditLogService } from "../audit/procurement-audit-service.js";

import { findPurchaseOrderById } from "../purchase-orders/purchase-order-repository.js";

import { sendPurchaseOrderWithDatabase } from "./purchase-order-send-repository.js";
import { findPurchaseOrderLines } from "../purchase-orders/purchase-order-line-repository.js";
import { getVendorProducts } from "../../clients/vendor-client.js";
import { createOutboxEvent } from "../events/outbox-service.js";

export async function sendPurchaseOrder(id: string, actorId: string) {
  const existingPurchaseOrder = await findPurchaseOrderById(id);

  if (!existingPurchaseOrder) {
    throw new AppError("Purchase order not found", 404);
  }

  if (existingPurchaseOrder.status !== "APPROVED") {
    throw new AppError("Only approved purchase orders can be sent", 409);
  }

  const [purchaseOrderLines, vendorProducts] = await Promise.all([
    findPurchaseOrderLines(id),
    getVendorProducts(existingPurchaseOrder.vendorId).catch((error) => {
      console.error("Could not load supplier lead times for reliability event:", error);
      return [];
    }),
  ]);
  const leadTimesByProduct = new Map(
    vendorProducts.map((product) => [product.productId, product.leadTimeDays]),
  );

  return db.transaction(async (tx) => {
    const purchaseOrder = await sendPurchaseOrderWithDatabase(id, tx);

    if (!purchaseOrder) {
      throw new Error("Failed to send purchase order");
    }

    await createProcurementAuditLogService(
      {
        purchaseOrderId: purchaseOrder.id,
        action: "PO_SENT",
        actorId,
        beforeState: existingPurchaseOrder,
        afterState: purchaseOrder,
      },
      tx,
    );

    const outboxEvent = await createOutboxEvent(
      {
        eventId: randomUUID(),
        eventType: "PurchaseOrderSent",
        aggregateType: "PurchaseOrder",
        aggregateId: purchaseOrder.id,
        payload: {
          purchaseOrderId: purchaseOrder.id,
          vendorId: purchaseOrder.vendorId,
          poNumber: purchaseOrder.poNumber,
          sentAt: (purchaseOrder.sentAt ?? new Date()).toISOString(),
          lines: purchaseOrderLines.map((line) => ({
            purchaseOrderLineId: line.id,
            productId: line.productId,
            quantityOrdered: line.quantityOrdered,
            leadTimeDaysSnapshot: leadTimesByProduct.get(line.productId) ?? null,
          })),
        },
        status: "PENDING",
        attempts: 0,
        occurredAt: purchaseOrder.sentAt ?? new Date(),
      },
      tx,
    );
    if (!outboxEvent) throw new Error("Failed to create purchase order sent event");

    return purchaseOrder;
  });
}

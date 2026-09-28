import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";

import { createProcurementAuditLogService } from "../audit/procurement-audit-service.js";
import { createOutboxEvent } from "../events/outbox-service.js";

import { findPurchaseOrderById } from "../purchase-orders/purchase-order-repository.js";
import { findPurchaseOrderLinesWithDatabase } from "../purchase-orders/purchase-order-line-repository.js";
import {
  cancelPurchaseOrderWithDatabase,
  createPurchaseOrderCancellationWithDatabase,
} from "./purchase-order-cancellation-repository.js";

export async function cancelPurchaseOrder(
  id: string,
  actorId: string,
  reason: string,
) {
  const existingPurchaseOrder = await findPurchaseOrderById(id);

  if (!existingPurchaseOrder) {
    throw new AppError("Purchase order not found", 404);
  }

  const cancellableStatuses = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
    "PARTIALLY_RECEIVED",
  ];

  if (!cancellableStatuses.includes(existingPurchaseOrder.status)) {
    throw new AppError(
      "Purchase order cannot be cancelled in its current state",
      409,
    );
  }

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new AppError("Cancellation reason is required", 400, [
      { field: "reason", message: "Enter a reason for cancelling this PO." },
    ]);
  }

  return db.transaction(async (tx) => {
    const purchaseOrderLines = await findPurchaseOrderLinesWithDatabase(id, tx);

    if (purchaseOrderLines.length === 0) {
      throw new AppError("Purchase order has no lines", 409);
    }

    const purchaseOrder = await cancelPurchaseOrderWithDatabase(id, tx);

    if (!purchaseOrder) {
      throw new Error("Failed to cancel purchase order");
    }

    const cancellation = await createPurchaseOrderCancellationWithDatabase(
      {
        purchaseOrderId: purchaseOrder.id,
        reason: normalizedReason,
        cancelledBy: actorId,
      },
      tx,
    );

    if (!cancellation) {
      throw new Error("Failed to create purchase order cancellation record");
    }

    await createProcurementAuditLogService(
      {
        purchaseOrderId: purchaseOrder.id,
        action: "PO_CANCELLED",
        actorId,
        beforeState: existingPurchaseOrder,
        afterState: purchaseOrder,
        details: { reason: normalizedReason },
      },
      tx,
    );

    const outboxEvent = await createOutboxEvent(
      {
        eventId: crypto.randomUUID(),
        eventType: "PurchaseOrderCancelled",
        aggregateType: "PurchaseOrder",
        aggregateId: purchaseOrder.id,
        payload: {
          purchaseOrderId: purchaseOrder.id,
          lines: purchaseOrderLines.map((line) => ({
            productId: line.productId,
            locationId: purchaseOrder.destinationLocationId,
            quantityRemaining: line.quantityOrdered - line.quantityReceived,
          })),
        },
      },
      tx,
    );

    if (!outboxEvent) {
      throw new Error("Failed to create purchase order cancelled outbox event");
    }

    return purchaseOrder;
  });
}

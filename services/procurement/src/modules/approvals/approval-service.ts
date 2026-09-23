import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";

import {
  approvePurchaseOrderWithDatabase,
  findPurchaseOrderById,
  rejectPurchaseOrderWithDatabase,
} from "../purchase-orders/purchase-order-repository.js";
import { findPurchaseOrderLinesWithDatabase } from "../purchase-orders/purchase-order-line-repository.js";
import { createApprovalAuditLogWithDatabase } from "./approval-audit-repository.js";
import { createPurchaseOrderApprovalWithDatabase } from "./approval-repository.js";

import { createOutboxEvent } from "../events/outbox-service.js";

export async function approvePurchaseOrder(
  purchaseOrderId: string,
  approverId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "PENDING_APPROVAL") {
    throw new AppError("Purchase order is not pending approval", 409);
  }

  if (purchaseOrder.createdBy === approverId) {
    throw new AppError(
      "Purchase order creator cannot approve their own purchase order",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const purchaseOrderLines = await findPurchaseOrderLinesWithDatabase(
      purchaseOrderId,
      tx,
    );

    if (purchaseOrderLines.length === 0) {
      throw new AppError("Purchase order has no lines", 409);
    }

    const updatedPurchaseOrder = await approvePurchaseOrderWithDatabase(
      purchaseOrderId,
      approverId,
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new AppError("Purchase order is no longer pending approval", 409);
    }

    const approval = await createPurchaseOrderApprovalWithDatabase(
      {
        purchaseOrderId,
        approverId,
        decision: "APPROVED",
      },
      tx,
    );

    if (!approval) {
      throw new Error("Failed to create purchase order approval");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_APPROVED",
        actorId: approverId,
        beforeState: purchaseOrder,
        afterState: updatedPurchaseOrder,
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order approval audit");
    }

    const outboxEvent = await createOutboxEvent(
      {
        eventId: crypto.randomUUID(),
        eventType: "PurchaseOrderApproved",
        aggregateType: "PurchaseOrder",
        aggregateId: purchaseOrder.id,
        payload: {
          purchaseOrderId: updatedPurchaseOrder.id,
          lines: purchaseOrderLines.map((line) => ({
            productId: line.productId,
            locationId: updatedPurchaseOrder.destinationLocationId,
            quantityOrdered: line.quantityOrdered,
          })),
        },
      },
      tx,
    );

    if (!outboxEvent) {
      throw new Error("Failed to create purchase order approved outbox event");
    }

    return updatedPurchaseOrder;
  });
}

export async function rejectPurchaseOrder(
  purchaseOrderId: string,
  approverId: string,
  comments?: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "PENDING_APPROVAL") {
    throw new AppError("Purchase order is not pending approval", 409);
  }

  if (purchaseOrder.createdBy === approverId) {
    throw new AppError(
      "Purchase order creator cannot reject their own purchase order",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder = await rejectPurchaseOrderWithDatabase(
      purchaseOrderId,
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new AppError("Purchase order is no longer pending approval", 409);
    }

    const approval = await createPurchaseOrderApprovalWithDatabase(
      {
        purchaseOrderId,
        approverId,
        decision: "REJECTED",
        comments,
      },
      tx,
    );

    if (!approval) {
      throw new Error("Failed to create purchase order rejection");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_REJECTED",
        actorId: approverId,
        beforeState: purchaseOrder,
        afterState: updatedPurchaseOrder,
        details: comments ? { comments } : undefined,
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order rejection audit");
    }

    return updatedPurchaseOrder;
  });
}

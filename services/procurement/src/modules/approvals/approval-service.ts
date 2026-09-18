import { db } from "../../db/index.js";
import {
  findPurchaseOrderById,
  updatePurchaseOrderWithDatabase,
} from "../purchase-orders/purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "./approval-audit-repository.js";
import { createPurchaseOrderApprovalWithDatabase } from "./approval-repository.js";

export async function approvePurchaseOrder(
  purchaseOrderId: string,
  approverId: string,
) {
  const purchaseOrder =
    await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "PENDING_APPROVAL") {
    throw new Error(
      "Purchase order is not pending approval",
    );
  }

  if (purchaseOrder.createdBy === approverId) {
    throw new Error(
      "Purchase order creator cannot approve their own purchase order",
    );
  }

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder =
      await updatePurchaseOrderWithDatabase(
        purchaseOrderId,
        {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: approverId,
        },
        tx,
      );

    if (!updatedPurchaseOrder) {
      throw new Error(
        "Failed to approve purchase order",
      );
    }

    const approval =
      await createPurchaseOrderApprovalWithDatabase(
        {
          purchaseOrderId,
          approverId,
          decision: "APPROVED",
        },
        tx,
      );

    if (!approval) {
      throw new Error(
        "Failed to create purchase order approval",
      );
    }

    const auditLog =
      await createApprovalAuditLogWithDatabase(
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
      throw new Error(
        "Failed to create purchase order approval audit",
      );
    }

    return updatedPurchaseOrder;
  });
}

export async function rejectPurchaseOrder(
  purchaseOrderId: string,
  approverId: string,
  comments?: string,
) {
  const purchaseOrder =
    await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "PENDING_APPROVAL") {
    throw new Error(
      "Purchase order is not pending approval",
    );
  }

  if (purchaseOrder.createdBy === approverId) {
    throw new Error(
      "Purchase order creator cannot reject their own purchase order",
    );
  }

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder =
      await updatePurchaseOrderWithDatabase(
        purchaseOrderId,
        {
          status: "DRAFT",
        },
        tx,
      );

    if (!updatedPurchaseOrder) {
      throw new Error(
        "Failed to reject purchase order",
      );
    }

    const approval =
      await createPurchaseOrderApprovalWithDatabase(
        {
          purchaseOrderId,
          approverId,
          decision: "REJECTED",
          comments,
        },
        tx,
      );

    if (!approval) {
      throw new Error(
        "Failed to create purchase order rejection",
      );
    }

    const auditLog =
      await createApprovalAuditLogWithDatabase(
        {
          purchaseOrderId,
          action: "PO_REJECTED",
          actorId: approverId,
          beforeState: purchaseOrder,
          afterState: updatedPurchaseOrder,
          details: comments
            ? { comments }
            : undefined,
        },
        tx,
      );

    if (!auditLog) {
      throw new Error(
        "Failed to create purchase order rejection audit",
      );
    }

    return updatedPurchaseOrder;
  });
}
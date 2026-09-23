import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  findPurchaseOrderById,
  updatePurchaseOrderWithDatabase,
} from "./purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";

export async function submitPurchaseOrderForApproval(
  purchaseOrderId: string,
  actorId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "DRAFT") {
    throw new AppError(
      "Only draft purchase orders can be submitted for approval",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder = await updatePurchaseOrderWithDatabase(
      purchaseOrderId,
      {
        status: "PENDING_APPROVAL",
      },
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new Error("Failed to submit purchase order for approval");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_SUBMITTED_FOR_APPROVAL",
        actorId,
        beforeState: purchaseOrder,
        afterState: updatedPurchaseOrder,
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order submission audit");
    }

    return updatedPurchaseOrder;
  });
}

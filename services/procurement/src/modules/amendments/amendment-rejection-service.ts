import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import {
  findPurchaseOrderAmendmentById,
  updatePurchaseOrderAmendmentWithDatabase,
} from "./amendment-repository.js";

export async function rejectPurchaseOrderAmendment(
  amendmentId: string,
  approverId: string,
  comments?: string,
) {
  const amendment = await findPurchaseOrderAmendmentById(amendmentId);

  if (!amendment) {
    return null;
  }

  if (amendment.status !== "PENDING") {
    throw new AppError("Purchase order amendment is not pending approval", 409);
  }

  if (amendment.requestedBy === approverId) {
    throw new AppError(
      "Amendment requester cannot reject their own amendment",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const rejectedAmendment = await updatePurchaseOrderAmendmentWithDatabase(
      amendment.id,
      {
        status: "REJECTED",
      },
      tx,
    );

    if (!rejectedAmendment) {
      throw new Error("Failed to reject purchase order amendment");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId: amendment.purchaseOrderId,
        action: "PO_AMENDMENT_REJECTED",
        actorId: approverId,
        beforeState: amendment,
        afterState: rejectedAmendment,
        details: comments ? { comments } : undefined,
      },
      tx,
    );

    if (!auditLog) {
      throw new Error(
        "Failed to create purchase order amendment rejection audit",
      );
    }

    return rejectedAmendment;
  });
}

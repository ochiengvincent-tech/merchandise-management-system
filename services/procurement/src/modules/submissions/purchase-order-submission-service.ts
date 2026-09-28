import { db } from "../../db/index.js";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import {
  findPurchaseOrderById,
  updatePurchaseOrderWithDatabase,
} from "../purchase-orders/purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import { centsToMoney, moneyToCents } from "../purchase-orders/money.js";

export function assertPurchaseOrderWithinLimit(
  totalAmount: string,
  maximumValueKes = env.MAX_PO_VALUE_KES,
) {
  const maximumCents = BigInt(maximumValueKes) * 100n;
  const totalCents = moneyToCents(totalAmount);

  if (totalCents > maximumCents) {
    throw new AppError(
      `PO total KES ${centsToMoney(totalCents)} exceeds the maximum allowed value of KES ${centsToMoney(maximumCents)}`,
      409,
      [
        {
          field: "totalAmount",
          message: `The maximum PO value is KES ${centsToMoney(maximumCents)}.`,
        },
      ],
    );
  }
}

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

  if (purchaseOrder.revisionRequired) {
    throw new AppError(
      "Purchase order must be revised before it can be resubmitted",
      409,
      [
        {
          field: "revisionRequired",
          message: "Change the notes or destination before resubmitting.",
        },
      ],
    );
  }

  if (purchaseOrder.currency !== "KES") {
    throw new AppError(
      "Only KES purchase orders can be submitted while the value limit is configured in KES",
      409,
    );
  }

  assertPurchaseOrderWithinLimit(purchaseOrder.totalAmount);

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

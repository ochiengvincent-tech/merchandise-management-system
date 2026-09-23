import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  getLocationById,
  InventoryServiceError,
} from "../../clients/inventory-client.js";
import { findPurchaseOrderById } from "../purchase-orders/purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import {
  createPurchaseOrderAmendmentWithDatabase,
  findPurchaseOrderAmendments,
} from "./amendment-repository.js";

type PurchaseOrderAmendmentData = {
  notes?: string;
  destinationLocationId?: string;
};

export async function requestPurchaseOrderAmendment(
  purchaseOrderId: string,
  data: PurchaseOrderAmendmentData,
  requestedBy: string,
  reason: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "APPROVED" && purchaseOrder.status !== "SENT") {
    throw new AppError(
      "Only approved or sent purchase orders can be amended",
      409,
    );
  }

  if (!reason.trim()) {
    throw new AppError("Amendment reason is required", 400);
  }

  if (data.notes === undefined && data.destinationLocationId === undefined) {
    throw new AppError("At least one amendment field is required", 400);
  }

  if (data.destinationLocationId !== undefined) {
    try {
      const location = await getLocationById(data.destinationLocationId);

      if (location.status !== "ACTIVE") {
        throw new AppError("Destination location is not active", 409);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof InventoryServiceError) {
        if (error.status === 404) {
          throw new AppError("Destination location not found", 404);
        }

        throw new AppError("Inventory service unavailable", 500);
      }

      throw error;
    }
  }

  const existingAmendments = await findPurchaseOrderAmendments(purchaseOrderId);

  const amendmentNumber =
    existingAmendments.length > 0
      ? Math.max(
          ...existingAmendments.map((amendment) => amendment.amendmentNumber),
        ) + 1
      : 1;

  return db.transaction(async (tx) => {
    const amendment = await createPurchaseOrderAmendmentWithDatabase(
      {
        purchaseOrderId,
        amendmentNumber,
        reason,
        previousData: purchaseOrder,
        newData: data,
        requestedBy,
        status: "PENDING",
      },
      tx,
    );

    if (!amendment) {
      throw new Error("Failed to create purchase order amendment");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_AMENDMENT_REQUESTED",
        actorId: requestedBy,
        beforeState: purchaseOrder,
        afterState: purchaseOrder,
        details: {
          amendmentId: amendment.id,
          amendmentNumber,
          reason,
          newData: data,
        },
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order amendment audit");
    }

    return amendment;
  });
}

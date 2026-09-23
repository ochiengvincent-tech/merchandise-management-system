import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  getLocationById,
  InventoryServiceError,
} from "../../clients/inventory-client.js";
import {
  findPurchaseOrderById,
  updatePurchaseOrderWithDatabase,
} from "../purchase-orders/purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import {
  findPurchaseOrderAmendmentById,
  updatePurchaseOrderAmendmentWithDatabase,
} from "./amendment-repository.js";

type PurchaseOrderAmendmentData = {
  notes?: string;
  destinationLocationId?: string;
};

export async function approvePurchaseOrderAmendment(
  amendmentId: string,
  approverId: string,
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
      "Amendment requester cannot approve their own amendment",
      409,
    );
  }

  const purchaseOrder = await findPurchaseOrderById(amendment.purchaseOrderId);

  if (!purchaseOrder) {
    throw new AppError(
      "Purchase order associated with amendment not found",
      404,
    );
  }

  if (purchaseOrder.status !== "APPROVED" && purchaseOrder.status !== "SENT") {
    throw new AppError(
      "Only approved or sent purchase orders can have amendments approved",
      409,
    );
  }

  const amendmentData = amendment.newData as PurchaseOrderAmendmentData;

  if (amendmentData.destinationLocationId !== undefined) {
    try {
      const location = await getLocationById(
        amendmentData.destinationLocationId,
      );

      if (location.status !== "ACTIVE") {
        throw new AppError("Destination location is inactive", 409);
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

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder = await updatePurchaseOrderWithDatabase(
      purchaseOrder.id,
      amendmentData,
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new Error("Failed to apply purchase order amendment");
    }

    const approvedAmendment = await updatePurchaseOrderAmendmentWithDatabase(
      amendment.id,
      {
        status: "APPROVED",
        approvedBy: approverId,
        approvedAt: new Date(),
      },
      tx,
    );

    if (!approvedAmendment) {
      throw new Error("Failed to approve purchase order amendment");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId: purchaseOrder.id,
        action: "PO_AMENDED",
        actorId: approverId,
        beforeState: purchaseOrder,
        afterState: updatedPurchaseOrder,
        details: {
          amendmentId: amendment.id,
          amendmentNumber: amendment.amendmentNumber,
          requestedBy: amendment.requestedBy,
        },
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order amendment audit");
    }

    return {
      amendment: approvedAmendment,
      purchaseOrder: updatedPurchaseOrder,
    };
  });
}

import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  getLocationById,
  InventoryServiceError,
} from "../../clients/inventory-client.js";
import {
  findPurchaseOrderById,
  updatePurchaseOrderWithDatabase,
} from "./purchase-order-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";

type UpdatePurchaseOrderInput = {
  notes?: string;
  destinationLocationId?: string;
};

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  data: UpdatePurchaseOrderInput,
  actorId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "DRAFT") {
    throw new AppError("Only draft purchase orders can be updated", 409);
  }

  if (data.notes === undefined && data.destinationLocationId === undefined) {
    throw new AppError("At least one update field is required", 400);
  }

  if (data.destinationLocationId !== undefined) {
    let location;

    try {
      location = await getLocationById(data.destinationLocationId);
    } catch (error) {
      if (error instanceof InventoryServiceError && error.status === 404) {
        throw new AppError("Destination location not found", 404);
      }

      throw new AppError("Inventory service is unavailable", 503);
    }

    if (location.status !== "ACTIVE") {
      throw new AppError("Destination location is inactive", 409);
    }
  }

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder = await updatePurchaseOrderWithDatabase(
      purchaseOrderId,
      data,
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new Error("Failed to update purchase order");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_UPDATED",
        actorId,
        beforeState: purchaseOrder,
        afterState: updatedPurchaseOrder,
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order update audit");
    }

    return updatedPurchaseOrder;
  });
}

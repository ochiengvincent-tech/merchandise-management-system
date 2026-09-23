import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";

import { createProcurementAuditLogService } from "../audit/procurement-audit-service.js";

import { findPurchaseOrderById } from "./purchase-order-repository.js";

import { sendPurchaseOrderWithDatabase } from "./purchase-order-send-repository.js";

export async function sendPurchaseOrder(
  id: string,
  actorId: string,
) {
  const existingPurchaseOrder = await findPurchaseOrderById(id);

  if (!existingPurchaseOrder) {
    throw new AppError(
      "Purchase order not found",
      404,
    );
  }

  if (existingPurchaseOrder.status !== "APPROVED") {
    throw new AppError(
      "Only approved purchase orders can be sent",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const purchaseOrder =
      await sendPurchaseOrderWithDatabase(
        id,
        tx,
      );

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

    return purchaseOrder;
  });
}
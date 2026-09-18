import { db } from "../../db/index.js";
import {
  createPurchaseOrderWithDatabase,
} from "./purchase-order-repository.js";
import {
  createPurchaseOrderLinesWithDatabase,
} from "./purchase-order-line-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";

type PurchaseOrderLineInput = {
  productId: string;
  quantityOrdered: number;
  unitPrice: string;
};

type CreatePurchaseOrderInput = {
  poNumber: string;
  vendorId: string;
  destinationLocationId: string;
  currency?: string;
  paymentTerms: string;
  lines: PurchaseOrderLineInput[];
  notes?: string;
  createdBy: string;
};

export async function createPurchaseOrder(
  data: CreatePurchaseOrderInput,
) {
  if (data.lines.length === 0) {
    throw new Error(
      "Purchase order must contain at least one line",
    );
  }

  const subtotal = data.lines.reduce(
    (total, line) =>
      total +
      line.quantityOrdered * Number(line.unitPrice),
    0,
  );

  return db.transaction(async (tx) => {
    const purchaseOrder =
      await createPurchaseOrderWithDatabase(
        {
          poNumber: data.poNumber,
          vendorId: data.vendorId,
          destinationLocationId:
            data.destinationLocationId,
          status: "DRAFT",
          currency: data.currency ?? "KES",
          paymentTerms: data.paymentTerms,
          subtotal: subtotal.toFixed(2),
          totalAmount: subtotal.toFixed(2),
          notes: data.notes,
          createdBy: data.createdBy,
        },
        tx,
      );

    if (!purchaseOrder) {
      throw new Error(
        "Failed to create purchase order",
      );
    }

    const lines = await createPurchaseOrderLinesWithDatabase(
      data.lines.map((line) => ({
        purchaseOrderId: purchaseOrder.id,
        productId: line.productId,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: 0,
        unitPrice: line.unitPrice,
        lineTotal: (
          line.quantityOrdered * Number(line.unitPrice)
        ).toFixed(2),
      })),
      tx,
    );

    if (lines.length !== data.lines.length) {
      throw new Error(
        "Failed to create purchase order lines",
      );
    }

    const auditLog =
      await createApprovalAuditLogWithDatabase(
        {
          purchaseOrderId: purchaseOrder.id,
          action: "PO_CREATED",
          actorId: data.createdBy,
          beforeState: null,
          afterState: {
            ...purchaseOrder,
            lines,
          },
        },
        tx,
      );

    if (!auditLog) {
      throw new Error(
        "Failed to create purchase order audit",
      );
    }

    return {
      purchaseOrder,
      lines,
    };
  });
}
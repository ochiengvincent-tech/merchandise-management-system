import { createHash } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import {
  getActiveProduct,
  getActiveProductById,
  getPurchaseOrder,
  listOpenPurchaseOrders,
  reportAcceptedQuantities,
} from "../../clients/service-clients.js";
import {
  createGoodsReceipt,
  findGoodsReceiptById,
  findPendingProcurementSyncs,
  listGoodsReceipts,
  updateProcurementSync,
} from "./receipt-repository.js";

type ReceiptLineInput = {
  purchaseOrderLineId?: string;
  productId: string;
  productCode: string;
  quantityObserved: number;
  quantityDamaged: number;
  notes?: string;
};

export type RecordGoodsReceiptInput = {
  purchaseOrderId: string;
  supplierDeliveryNote?: string;
  notes?: string;
  receivedBy: string;
  lines: ReceiptLineInput[];
};

function hashRequest(input: RecordGoodsReceiptInput) {
  const normalized = {
    purchaseOrderId: input.purchaseOrderId,
    supplierDeliveryNote: input.supplierDeliveryNote ?? null,
    notes: input.notes ?? null,
    receivedBy: input.receivedBy,
    lines: [...input.lines]
      .map((line) => ({
        ...line,
        notes: line.notes ?? null,
      }))
      .sort((left, right) =>
        (left.purchaseOrderLineId ?? left.productId).localeCompare(
          right.purchaseOrderLineId ?? right.productId,
        ),
      ),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function getDiscrepancies(
  expected: number,
  observed: number,
  damaged: number,
) {
  const discrepancies: string[] = [];
  if (observed < expected) discrepancies.push("SHORTAGE");
  if (observed > expected) discrepancies.push("OVERAGE");
  if (damaged > 0) discrepancies.push("DAMAGE");
  return discrepancies;
}

async function synchronizeProcurement(
  receipt: NonNullable<Awaited<ReturnType<typeof findGoodsReceiptById>>>,
) {
  const acceptedLines = receipt.lines.filter(
    (line) => line.purchaseOrderLineId && line.quantityAccepted > 0,
  );

  try {
    await reportAcceptedQuantities({
      purchaseOrderId: receipt.purchaseOrderId,
      receivingReceiptId: receipt.id,
      actorId: receipt.receivedBy,
      items: acceptedLines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId!,
        quantityReceived: line.quantityAccepted,
      })),
    });
    await updateProcurementSync(receipt.id, "SYNCED");
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Procurement synchronization failed";
    await updateProcurementSync(receipt.id, "RETRYING", message);
    if (error instanceof AppError) {
      throw new AppError(
        `GRN ${receipt.grnNumber} was recorded, but Procurement has not confirmed the received quantities. Retry with the same Idempotency-Key. ${error.message}`,
        error.statusCode,
        error.details,
      );
    }
    throw new AppError(
      `GRN ${receipt.grnNumber} was recorded, but Procurement synchronization is pending. Retry with the same Idempotency-Key.`,
      503,
    );
  }
}

async function resolveExistingGoodsReceipt(
  goodsReceiptId: string,
  requestHash: string,
) {
  const savedReceipt = await findGoodsReceiptById(goodsReceiptId);
  if (!savedReceipt) return null;

  if (savedReceipt.requestHash !== requestHash) {
    throw new AppError(
      "Idempotency-Key was already used with different receipt data",
      409,
    );
  }
  if (savedReceipt.procurementSyncStatus !== "SYNCED") {
    await synchronizeProcurement(savedReceipt);
  }

  const reloaded = await findGoodsReceiptById(goodsReceiptId);
  if (!reloaded) throw new AppError("Goods receipt not found", 500);
  return reloaded;
}

export async function recordGoodsReceipt(
  input: RecordGoodsReceiptInput,
  goodsReceiptId: string,
) {
  const requestHash = hashRequest(input);
  const existingReceipt = await resolveExistingGoodsReceipt(
    goodsReceiptId,
    requestHash,
  );
  if (existingReceipt) return existingReceipt;

  const purchaseOrder = await getPurchaseOrder(input.purchaseOrderId);
  if (!["SENT", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
    throw new AppError(
      "Goods can only be received against a sent or partially received purchase order",
      409,
    );
  }

  const purchaseOrderLines = new Map(
    purchaseOrder.lines.map((line) => [line.id, line]),
  );
  const seenLines = new Set<string>();
  const preparedLines = [];

  for (const [index, line] of input.lines.entries()) {
    if (line.quantityDamaged > line.quantityObserved) {
      throw new AppError("Damaged quantity cannot exceed observed quantity", 400, [
        {
          field: `lines.${index}.quantityDamaged`,
          message: "Use a value no greater than the observed quantity.",
        },
      ]);
    }

    if (line.purchaseOrderLineId && seenLines.has(line.purchaseOrderLineId)) {
      throw new AppError("A PO line can appear only once on a GRN", 400, [
        {
          field: `lines.${index}.purchaseOrderLineId`,
          message: "This purchase order line is already included.",
        },
      ]);
    }
    if (line.purchaseOrderLineId) seenLines.add(line.purchaseOrderLineId);

    const purchaseOrderLine = line.purchaseOrderLineId
      ? purchaseOrderLines.get(line.purchaseOrderLineId)
      : undefined;
    if (line.purchaseOrderLineId && !purchaseOrderLine) {
      throw new AppError("Purchase order line was not found", 400, [
        {
          field: `lines.${index}.purchaseOrderLineId`,
          message: "Choose a line from the selected purchase order.",
        },
      ]);
    }
    if (purchaseOrderLine && purchaseOrderLine.productId !== line.productId) {
      throw new AppError("Product does not match the purchase order line", 409, [
        {
          field: `lines.${index}.productId`,
          message: "Select the product linked to this PO line.",
        },
      ]);
    }

    const product = await getActiveProduct(line.productId, line.productCode);
    const expected = purchaseOrderLine
      ? purchaseOrderLine.quantityOrdered - purchaseOrderLine.quantityReceived
      : 0;
    const undamaged = line.quantityObserved - line.quantityDamaged;
    const accepted = purchaseOrderLine
      ? Math.min(undamaged, expected)
      : 0;
    const condition =
      line.quantityDamaged === 0
        ? "GOOD"
        : line.quantityDamaged === line.quantityObserved
          ? "DAMAGED"
          : "MIXED";

    preparedLines.push({
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      productId: product.id,
      productCode: line.productCode,
      productName: product.name,
      quantityExpectedAtReceipt: expected,
      quantityObserved: line.quantityObserved,
      quantityDamaged: line.quantityDamaged,
      quantityAccepted: accepted,
      condition,
      discrepancies: getDiscrepancies(
        expected,
        line.quantityObserved,
        line.quantityDamaged,
      ),
      notes: line.notes ?? null,
    });
  }

  const receivedAt = new Date();
  const grnNumber = `GRN-${receivedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${goodsReceiptId.slice(0, 8).toUpperCase()}`;
  const receiptEventLines = preparedLines.map((line) => {
    const purchaseOrderLine = line.purchaseOrderLineId
      ? purchaseOrderLines.get(line.purchaseOrderLineId)
      : undefined;
    return {
      purchaseOrderLineId: line.purchaseOrderLineId,
      productId: line.productId,
      quantityObserved: line.quantityObserved,
      quantityDamaged: line.quantityDamaged,
      quantityAccepted: line.quantityAccepted,
      unitPrice: purchaseOrderLine ? Number(purchaseOrderLine.unitPrice) : 0,
    };
  });
  const event = {
    eventId: goodsReceiptId,
    eventType: "GoodsReceived",
    aggregateId: goodsReceiptId,
    payload: {
      goodsReceiptId,
      grnNumber,
      purchaseOrderId: purchaseOrder.id,
      vendorId: purchaseOrder.vendorId,
      destinationLocationId: purchaseOrder.destinationLocationId,
      receivedBy: input.receivedBy,
      currency: purchaseOrder.currency,
      lines: receiptEventLines,
    },
    status: "PENDING" as const,
    attempts: 0,
    occurredAt: receivedAt,
  };

  const receipt = await createGoodsReceipt({
    receipt: {
      id: goodsReceiptId,
      grnNumber,
      purchaseOrderId: purchaseOrder.id,
      destinationLocationId: purchaseOrder.destinationLocationId,
      supplierDeliveryNote: input.supplierDeliveryNote ?? null,
      receivedBy: input.receivedBy,
      receivedAt,
      procurementSyncStatus: "PENDING",
      procurementSyncError: null,
      requestHash,
      notes: input.notes ?? null,
    },
    lines: preparedLines,
    event,
  });

  if (!receipt) {
    // Another request with this idempotency key committed while this request
    // was validating the PO and product data. Resolve that canonical GRN.
    const concurrentReceipt = await resolveExistingGoodsReceipt(
      goodsReceiptId,
      requestHash,
    );
    if (concurrentReceipt) return concurrentReceipt;
    throw new AppError("Goods receipt could not be loaded after a duplicate insert", 500);
  }

  await synchronizeProcurement(receipt);
  const completedReceipt = await findGoodsReceiptById(goodsReceiptId);
  if (!completedReceipt) throw new AppError("Goods receipt not found", 500);
  return completedReceipt;
}

export async function getGoodsReceipt(goodsReceiptId: string) {
  const receipt = await findGoodsReceiptById(goodsReceiptId);
  if (!receipt) throw new AppError("Goods receipt not found", 404);
  return receipt;
}

export async function getReceivingPurchaseOrder(purchaseOrderId: string) {
  const purchaseOrder = await getPurchaseOrder(purchaseOrderId);
  if (!["SENT", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
    throw new AppError(
      "Only sent or partially received purchase orders are available for receiving",
      409,
    );
  }

  const lines = await Promise.all(
    purchaseOrder.lines.map(async (line) => {
      const product = await getActiveProductById(line.productId);
      return {
        ...line,
        quantityOutstanding: line.quantityOrdered - line.quantityReceived,
        product: {
          id: product.id,
          sku: product.sku,
          barcode: product.barcode ?? null,
          name: product.name,
        },
      };
    }),
  );
  return { ...purchaseOrder, lines };
}

export async function getOpenPurchaseOrders(input: {
  page: number;
  limit: number;
  search?: string;
}) {
  return listOpenPurchaseOrders(input);
}

export async function searchGoodsReceipts(input: {
  purchaseOrderId?: string;
  search?: string;
  discrepancy?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}) {
  return listGoodsReceipts({
    purchaseOrderId: input.purchaseOrderId,
    search: input.search,
    discrepancy: input.discrepancy,
    from: input.from,
    to: input.to,
    limit: input.limit,
    offset: (input.page - 1) * input.limit,
  });
}

export async function retryPendingProcurementSyncs() {
  const receipts = await findPendingProcurementSyncs();
  for (const receipt of receipts) {
    try {
      await synchronizeProcurement(receipt);
    } catch (error) {
      console.error(
        `Procurement synchronization is still pending for GRN ${receipt.grnNumber}:`,
        error,
      );
    }
  }
}

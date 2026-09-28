import { z } from "zod";

export const receivingPurchaseOrderSummarySchema = z.object({
  id: z.uuid(),
  poNumber: z.string(),
  status: z.enum(["SENT", "PARTIALLY_RECEIVED"]),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  requestedDeliveryDate: z.string().nullable(),
  createdAt: z.string(),
});

export const openPurchaseOrdersResponseSchema = z.object({
  data: z.array(receivingPurchaseOrderSummarySchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const receivingPurchaseOrderSchema = z.object({
  id: z.uuid(),
  poNumber: z.string(),
  status: z.enum(["SENT", "PARTIALLY_RECEIVED"]),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  currency: z.string(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      productId: z.uuid(),
      quantityOrdered: z.number(),
      quantityReceived: z.number(),
      quantityOutstanding: z.number(),
      unitPrice: z.union([z.string(), z.number()]),
      product: z.object({
        id: z.uuid(),
        sku: z.string(),
        barcode: z.string().nullable(),
        name: z.string(),
      }),
    }),
  ),
});

const goodsReceiptLineSchema = z.object({
  id: z.uuid(),
  goodsReceiptId: z.uuid(),
  purchaseOrderLineId: z.uuid().nullable(),
  productId: z.uuid(),
  productCode: z.string(),
  productName: z.string().nullable(),
  quantityExpectedAtReceipt: z.number().int(),
  quantityObserved: z.number().int(),
  quantityDamaged: z.number().int(),
  quantityAccepted: z.number().int(),
  quantityRejected: z.number().int(),
  condition: z.enum(["GOOD", "DAMAGED", "MIXED"]),
  discrepancies: z.array(z.enum(["SHORTAGE", "OVERAGE", "DAMAGE"])),
  notes: z.string().nullable(),
});

export const goodsReceiptSchema = z.object({
  id: z.uuid(),
  grnNumber: z.string(),
  purchaseOrderId: z.uuid(),
  destinationLocationId: z.uuid(),
  supplierDeliveryNote: z.string().nullable(),
  receivedBy: z.uuid(),
  receivedAt: z.string(),
  procurementSyncStatus: z.enum(["PENDING", "SYNCED", "RETRYING"]),
  procurementSyncError: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  lines: z.array(goodsReceiptLineSchema),
});

export const goodsReceiptResponseSchema = z.object({ data: goodsReceiptSchema });

export const goodsReceiptListResponseSchema = z.object({
  data: z.array(goodsReceiptSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type OpenPurchaseOrder = z.infer<typeof receivingPurchaseOrderSummarySchema>;
export type ReceivingPurchaseOrder = z.infer<typeof receivingPurchaseOrderSchema>;
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

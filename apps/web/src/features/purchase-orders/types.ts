import { z } from "zod";

export const purchaseOrderStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "COMPLETED",
  "CANCELLED",
]);

export const purchaseOrderLineSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  productId: z.uuid(),
  quantityOrdered: z.number().int(),
  quantityReceived: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const purchaseOrderCancellationSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  reason: z.string(),
  cancelledBy: z.uuid(),
  cancelledAt: z.string(),
});

export const purchaseOrderSchema = z.object({
  id: z.uuid(),
  poNumber: z.string(),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  requestedDeliveryDate: z.iso.date().nullable(),
  status: purchaseOrderStatusSchema,
  revisionRequired: z.boolean(),
  currency: z.string(),
  paymentTerms: z.string(),
  subtotal: z.string(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  createdBy: z.uuid(),
  approvedAt: z.string().nullable(),
  approvedBy: z.uuid().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const purchaseOrderListResponseSchema = z.object({
  data: z.array(purchaseOrderSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const purchaseOrderResponseSchema = z.object({
  data: purchaseOrderSchema.extend({
    lines: z.array(purchaseOrderLineSchema),
    cancellation: purchaseOrderCancellationSchema.nullable(),
  }),
});

export const purchaseOrderReceiptResponseSchema = z.object({
  data: z.object({
    purchaseOrder: purchaseOrderSchema,
    lines: z.array(purchaseOrderLineSchema),
  }),
});

export const purchaseOrderCreateResponseSchema = z.object({
  data: z.object({
    purchaseOrder: purchaseOrderSchema,
    lines: z.array(purchaseOrderLineSchema),
  }),
});

export const purchaseOrderActionResponseSchema = z.object({
  data: purchaseOrderSchema,
});

export const purchaseOrderPolicyResponseSchema = z.object({
  data: z.object({
    currency: z.literal("KES"),
    maxPoValueKes: z.string().regex(/^\d+(\.\d{2})$/),
  }),
});

export const purchaseOrderAmendmentSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  amendmentNumber: z.number().int().positive(),
  reason: z.string(),
  previousData: z.record(z.string(), z.unknown()),
  newData: z.record(z.string(), z.unknown()),
  requestedBy: z.uuid(),
  approvedBy: z.uuid().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
});

export const purchaseOrderAmendmentsResponseSchema = z.object({
  data: z.array(purchaseOrderAmendmentSchema),
});

export const purchaseOrderAmendmentResponseSchema = z.object({
  data: purchaseOrderAmendmentSchema,
});

export const purchaseOrderAmendmentApprovalResponseSchema = z.object({
  data: z.object({
    amendment: purchaseOrderAmendmentSchema,
    purchaseOrder: purchaseOrderSchema,
  }),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;
export type PurchaseOrderCancellation = z.infer<
  typeof purchaseOrderCancellationSchema
>;
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;
export type PurchaseOrderListResponse = z.infer<
  typeof purchaseOrderListResponseSchema
>;
export type PurchaseOrderResponse = z.infer<typeof purchaseOrderResponseSchema>;
export type PurchaseOrderReceiptResponse = z.infer<
  typeof purchaseOrderReceiptResponseSchema
>;
export type PurchaseOrderCreateResponse = z.infer<
  typeof purchaseOrderCreateResponseSchema
>;
export type PurchaseOrderActionResponse = z.infer<
  typeof purchaseOrderActionResponseSchema
>;
export type PurchaseOrderPolicyResponse = z.infer<
  typeof purchaseOrderPolicyResponseSchema
>;
export type PurchaseOrderAmendment = z.infer<
  typeof purchaseOrderAmendmentSchema
>;

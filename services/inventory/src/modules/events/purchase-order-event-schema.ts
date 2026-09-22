import { z } from "zod";

export const purchaseOrderApprovedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("PurchaseOrderApproved"),
  purchaseOrderId: z.uuid(),
  lines: z.array(
    z.object({
      productId: z.uuid(),
      locationId: z.uuid(),
      quantityOrdered: z.number().int().positive()
    })
  ).min(1)
});

export const purchaseOrderCancelledEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal("PurchaseOrderCancelled"),
  purchaseOrderId: z.string().uuid(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      locationId: z.string().uuid(),
      quantityRemaining: z.number().int().positive()
    })
  ).min(1)
});
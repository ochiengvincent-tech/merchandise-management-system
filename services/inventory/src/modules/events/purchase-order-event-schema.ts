import { z } from "zod";

export const purchaseOrderApprovedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("PurchaseOrderApproved"),
  purchaseOrderId: z.uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        locationId: z.uuid(),
        quantityOrdered: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const purchaseOrderCancelledEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("PurchaseOrderCancelled"),
  purchaseOrderId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        locationId: z.uuid(),
        quantityRemaining: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const purchaseOrderReceivedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("PurchaseOrderReceived"),
  purchaseOrderId: z.uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        locationId: z.uuid(),
        quantityReceived: z.number().int().positive(),
      }),
    )
    .min(1),
});

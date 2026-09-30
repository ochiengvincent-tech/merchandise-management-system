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

  purchaseOrderId: z.uuid(),

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

        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const goodsReceivedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("GoodsReceived"),
  goodsReceiptId: z.uuid(),
  grnNumber: z.string().min(1),
  purchaseOrderId: z.uuid(),
  vendorId: z.uuid().optional(),
  destinationLocationId: z.uuid(),
  currency: z.string().length(3),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.uuid().nullable().optional(),
        productId: z.uuid(),
        quantityObserved: z.number().int().nonnegative().optional(),
        quantityDamaged: z.number().int().nonnegative().optional(),
        quantityAccepted: z.number().int().nonnegative(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});

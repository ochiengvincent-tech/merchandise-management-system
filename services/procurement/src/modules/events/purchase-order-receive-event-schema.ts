import { z } from "zod";

export const purchaseOrderReceivedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("PurchaseOrderReceived"),
  purchaseOrderId: z.uuid(),
  lines: z.array(
    z.object({
      productId: z.uuid(),
      locationId: z.uuid(),
      quantityReceived: z.number().int().positive(),
    }),
  ).min(1),
});
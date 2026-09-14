import { z } from "zod";

export const stockLowEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal("StockLow"),
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityOnHand: z.number().int().nonnegative(),
  quantityAllocated: z.number().int().nonnegative(),
  quantityAvailable: z.number().int().nonnegative(),
  reorderLevel: z.number().int().nonnegative()
});
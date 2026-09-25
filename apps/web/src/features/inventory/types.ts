import { z } from "zod";

export const stockSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityOnHand: z.number(),
  quantityAllocated: z.number(),
  quantityOnOrder: z.number(),
  unitCost: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  quantityAvailable: z.number(),
});

export const stocksSchema = z.array(stockSchema);

export type Stock = z.infer<typeof stockSchema>;
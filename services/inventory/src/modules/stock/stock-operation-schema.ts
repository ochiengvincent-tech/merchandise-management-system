import { z } from "zod";

export const allocateStockSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  actorId: z.string().uuid(),
  reference: z.string().trim().max(100).optional()
});

export const releaseStockSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  actorId: z.string().uuid(),
  reference: z.string().trim().max(100).optional()
});

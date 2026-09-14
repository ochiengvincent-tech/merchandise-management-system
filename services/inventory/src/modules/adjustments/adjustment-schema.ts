import { z } from "zod";

export const createAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityChange: z.number().int().refine((value) => value !== 0, {
    message: "Quantity change cannot be zero"
  }),
  reason: z.string().trim().min(1).max(255),
  reference: z.string().trim().max(100).optional(),
  createdBy: z.string().uuid()
});
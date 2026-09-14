import { z } from "zod";

export const stockByProductSchema = z.object({
  productId: z.string().uuid()
});

export const stockByLocationSchema = z.object({
  locationId: z.string().uuid()
});

export const stockByProductAndLocationSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid()
});
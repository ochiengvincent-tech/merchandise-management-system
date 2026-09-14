import { z } from "zod";

export const createVendorProductSchema = z.object({
  productId: z.uuid(),
  supplierProductCode: z.string().trim().max(100).optional(),
  currentPrice: z.coerce
    .number()
    .min(0)
    .transform((value) => value.toFixed(2)),
  leadTimeDays: z.coerce.number().int().min(0),
});

export const updateVendorProductSchema = z
  .object({
    supplierProductCode: z.string().trim().max(100).optional(),
    currentPrice: z.coerce
      .number()
      .min(0)
      .transform((value) => value.toFixed(2))
      .optional(),
    leadTimeDays: z.coerce.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

import { z } from "zod";

export const vendorProductSchema = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  productId: z.string().uuid(),
  supplierProductCode: z.string().nullable(),
  currentPrice: z.string(),
  leadTimeDays: z.number(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const vendorProductListResponseSchema = z.object({
  data: z.array(vendorProductSchema),
});

export const vendorProductResponseSchema = z.object({
  data: vendorProductSchema,
});

export type VendorProduct = z.infer<typeof vendorProductSchema>;

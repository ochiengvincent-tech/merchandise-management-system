import { z } from "zod";

export const productSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  unitOfMeasure: z.string(),
  barcode: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  reorderLevel: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const productsSchema = z.array(productSchema);

export type Product = z.infer<typeof productSchema>;
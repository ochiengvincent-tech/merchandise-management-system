import { z } from "zod";

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(100),
  unitOfMeasure: z.string().trim().min(1).max(30),
  barcode: z.string().trim().max(100).optional(),
  reorderLevel: z.number().int().nonnegative().default(0)
});

export const listProductsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  category: z.string().trim().optional()
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  unitOfMeasure: z.string().trim().min(1).max(30).optional(),
  barcode: z.string().trim().max(100).optional(),
  reorderLevel: z.number().int().nonnegative().optional()
});
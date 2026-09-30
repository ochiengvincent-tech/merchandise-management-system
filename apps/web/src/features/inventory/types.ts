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
export const adjustmentResponseSchema = z.object({
  stock: stockSchema,
  adjustment: z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantityChange: z.number().int(),
    reason: z.string(),
    reference: z.string().nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string(),
  }),
  stockLowEvent: z.unknown().nullable(),
});

export type CreateAdjustmentInput = {
  productId: string;
  locationId: string;
  quantityChange: number;
  reason: string;
  reference?: string;
  createdBy: string;
};

export const inventoryValuationSchema = z.object({
  currency: z.string(),
  totalValue: z.string(),
  records: z.array(z.object({
    stockId: z.string().uuid(),
    productId: z.string().uuid(),
    sku: z.string(),
    productName: z.string(),
    locationId: z.string().uuid(),
    locationCode: z.string(),
    locationName: z.string(),
    quantityOnHand: z.number(),
    quantityAllocated: z.number(),
    unitCost: z.string(),
    extendedValue: z.string(),
  })),
});
export type InventoryValuation = z.infer<typeof inventoryValuationSchema>;

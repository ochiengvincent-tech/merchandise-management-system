import { z } from "zod";

export const vendorSchema = z.object({
  id: z.string().uuid(),
  vendorCode: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  reliabilitySummary: z.object({
    score: z.number().int().min(0).max(100).nullable(),
    onTimeRate: z.number().int().min(0).max(100),
    fulfillmentRate: z.number().int().min(0).max(100),
    qualityRate: z.number().int().min(0).max(100),
    eligiblePurchaseOrders: z.number().int().nonnegative(),
    formulaVersion: z.string(),
    minimumEligiblePurchaseOrders: z.number().int().positive().optional(),
  }).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const vendorListResponseSchema = z.object({
  data: z.array(vendorSchema),
  total: z.number(),
});

export const vendorResponseSchema = z.object({
  data: vendorSchema,
});

export type Vendor = z.infer<typeof vendorSchema>;

export const vendorReliabilityResponseSchema = z.object({
  data: z.object({
    summary: z.object({
      score: z.number().int().min(0).max(100).nullable(),
      onTimeRate: z.number().int().min(0).max(100),
      fulfillmentRate: z.number().int().min(0).max(100),
      qualityRate: z.number().int().min(0).max(100),
      eligiblePurchaseOrders: z.number().int().nonnegative(),
      periodStart: z.string(),
      periodEnd: z.string(),
      formulaVersion: z.string(),
      calculatedAt: z.string(),
      minimumEligiblePurchaseOrders: z.number().int().positive(),
    }),
    history: z.array(z.object({
      purchaseOrderId: z.string().uuid(),
      poNumber: z.string(),
      sentAt: z.string(),
      dueAt: z.string().nullable(),
      status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]),
      orderedUnits: z.number().int().nonnegative(),
      observedUnits: z.number().int().nonnegative(),
      acceptedUnits: z.number().int().nonnegative(),
      damagedUnits: z.number().int().nonnegative(),
      onTimeRate: z.number().int().min(0).max(100),
      fulfillmentRate: z.number().int().min(0).max(100),
      qualityRate: z.number().int().min(0).max(100),
      score: z.number().int().min(0).max(100),
    })),
  }),
});

export type VendorReliability = z.infer<typeof vendorReliabilityResponseSchema>["data"];

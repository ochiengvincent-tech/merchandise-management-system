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
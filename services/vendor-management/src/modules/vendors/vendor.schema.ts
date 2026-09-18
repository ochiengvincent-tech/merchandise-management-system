import { z } from "zod";

export const createVendorSchema = z.object({
  vendorCode: z.string().trim().min(1).max(50),

  name: z.string().trim().min(1).max(255),

  email: z.email().optional(),

  phone: z.string().trim().max(30).optional(),

  address: z.string().trim().optional(),
  paymentTerms: z.string().trim().max(50).optional(),
});

export const listVendorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  search: z.string().trim().min(1).max(255).optional(),
});

export const updateVendorSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),

    email: z.email().optional(),

    phone: z.string().trim().max(30).optional(),

    address: z.string().trim().optional(),
    paymentTerms: z.string().trim().max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

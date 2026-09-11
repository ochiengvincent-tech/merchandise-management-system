import { z } from "zod";

export const createVendorSchema = z.object({
  vendorCode: z.string().trim().min(1).max(50),

  name: z.string().trim().min(1).max(255),

  email: z.email(),

  phone: z.string().trim().max(30).optional(),

  address: z.string().trim().optional(),
});
export const updateVendorSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),

    email: z.email().optional(),

    phone: z.string().trim().max(30).optional(),

    address: z.string().trim().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

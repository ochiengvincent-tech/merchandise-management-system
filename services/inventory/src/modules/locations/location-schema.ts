import { z } from "zod";

export const createLocationSchema = z.object({
  locationCode: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(255),
  locationType: z.enum(["WAREHOUSE", "STORE"])
});

export const listLocationsSchema = z.object({
  search: z.string().trim().optional(),
  locationType: z.enum(["WAREHOUSE", "STORE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  locationType: z.enum(["WAREHOUSE", "STORE"]).optional()
});
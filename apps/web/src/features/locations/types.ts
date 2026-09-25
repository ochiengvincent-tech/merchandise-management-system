import { z } from "zod";

export const locationSchema = z.object({
  id: z.string().uuid(),
  locationCode: z.string(),
  name: z.string(),
  locationType: z.enum(["WAREHOUSE", "STORE"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const locationsSchema = z.array(locationSchema);

export type Location = z.infer<typeof locationSchema>;
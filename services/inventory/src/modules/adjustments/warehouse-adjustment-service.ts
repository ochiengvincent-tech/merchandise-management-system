import type { z } from "zod";
import { warehouseAdjustmentSchema } from "./adjustment-schema.js";
import { createWarehouseAdjustment } from "./warehouse-adjustment-repository.js";

export async function createWarehouseAdjustmentService(
  input: z.infer<typeof warehouseAdjustmentSchema>,
) {
  return createWarehouseAdjustment(input);
}

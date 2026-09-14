import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";

export const createAdjustment = async (
  data: typeof inventoryAdjustments.$inferInsert
) => {
  const [adjustment] = await db
    .insert(inventoryAdjustments)
    .values(data)
    .returning();

  return adjustment;
};

export const findAdjustmentById = async (id: string) => {
  const [adjustment] = await db
    .select()
    .from(inventoryAdjustments)
    .where(eq(inventoryAdjustments.id, id))
    .limit(1);

  return adjustment ?? null;
};
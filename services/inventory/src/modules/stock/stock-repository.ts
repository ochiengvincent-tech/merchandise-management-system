import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";

type Database = Pick<typeof db, "select" | "insert" | "update">;

export const findStockByProductAndLocation = async (
  productId: string,
  locationId: string
) => {
  const [stock] = await db
    .select()
    .from(inventoryStock)
    .where(
      and(
        eq(inventoryStock.productId, productId),
        eq(inventoryStock.locationId, locationId)
      )
    )
    .limit(1);

  return stock ?? null;
};

export const findStockByProduct = async (productId: string) => {
  return db
    .select()
    .from(inventoryStock)
    .where(eq(inventoryStock.productId, productId));
};

export const findStockByLocation = async (locationId: string) => {
  return db
    .select()
    .from(inventoryStock)
    .where(eq(inventoryStock.locationId, locationId));
};

export const createStock = async (
  data: typeof inventoryStock.$inferInsert
) => {
  const [stock] = await db
    .insert(inventoryStock)
    .values(data)
    .returning();

  return stock;
};

export const updateStock = async (
  id: string,
  data: Partial<typeof inventoryStock.$inferInsert>
) => {
  const [stock] = await db
    .update(inventoryStock)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(inventoryStock.id, id))
    .returning();

  return stock ?? null;
};

export const allocateStock = async (
  id: string,
  quantity: number,
  database: Database
) => {
  const [stock] = await database
    .update(inventoryStock)
    .set({
      quantityAllocated: sql`${inventoryStock.quantityAllocated} + ${quantity}`,
      updatedAt: new Date()
    })
    .where(eq(inventoryStock.id, id))
    .returning();

  return stock ?? null;
};

export const releaseStock = async (
  id: string,
  quantity: number,
  database: Database
) => {
  const [stock] = await database
    .update(inventoryStock)
    .set({
      quantityAllocated: sql`${inventoryStock.quantityAllocated} - ${quantity}`,
      updatedAt: new Date()
    })
    .where(eq(inventoryStock.id, id))
    .returning();

  return stock ?? null;
};
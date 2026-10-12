import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { products } from "../../db/schema/products.js";
import { inventoryLocations } from "../../db/schema/inventory-locations.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { AppError } from "../../errors/app-error.js";

type Database = Pick<typeof db, "select" | "insert" | "update">;

export const findStockByProductAndLocation = async (
  productId: string,
  locationId: string,
) => {
  const [stock] = await db
    .select()
    .from(inventoryStock)
    .where(
      and(
        eq(inventoryStock.productId, productId),
        eq(inventoryStock.locationId, locationId),
      ),
    )
    .limit(1);

  return stock ?? null;
};

export const findStockByProductAndLocationWithDatabase = async <
  T extends Pick<typeof db, "select">,
>(
  productId: string,
  locationId: string,
  database: T,
) => {
  const [stock] = await database
    .select()
    .from(inventoryStock)
    .where(
      and(
        eq(inventoryStock.productId, productId),
        eq(inventoryStock.locationId, locationId),
      ),
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

export const findInventoryValuation = async () => {
  return db
    .select({
      stockId: inventoryStock.id,
      productId: inventoryStock.productId,
      sku: products.sku,
      productName: products.name,
      locationId: inventoryStock.locationId,
      locationCode: inventoryLocations.locationCode,
      locationName: inventoryLocations.name,
      quantityOnHand: inventoryStock.quantityOnHand,
      quantityAllocated: inventoryStock.quantityAllocated,
      unitCost: inventoryStock.unitCost,
      extendedValue: sql<string>`(${inventoryStock.carryingValueMinor}::numeric / 100)::numeric(20, 2)::text`,
    })
    .from(inventoryStock)
    .innerJoin(products, eq(inventoryStock.productId, products.id))
    .innerJoin(
      inventoryLocations,
      eq(inventoryStock.locationId, inventoryLocations.id),
    )
    .orderBy(products.name, inventoryLocations.name);
};

export const createStock = async (data: typeof inventoryStock.$inferInsert) => {
  const [stock] = await db.insert(inventoryStock).values(data).returning();

  return stock;
};

export const updateStock = async (
  id: string,
  data: Partial<typeof inventoryStock.$inferInsert>,
) => {
  const [stock] = await db
    .update(inventoryStock)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(inventoryStock.id, id))
    .returning();

  return stock ?? null;
};

export const findStockForUpdate = (id: string, database: Database) =>
  database
    .select()
    .from(inventoryStock)
    .where(eq(inventoryStock.id, id))
    .for("update")
    .limit(1);

export const updateStockById = (
  id: string,
  data: Partial<typeof inventoryStock.$inferInsert>,
  database: Database,
) =>
  database
    .update(inventoryStock)
    .set(data)
    .where(eq(inventoryStock.id, id))
    .returning();

export const allocateStock = async (
  id: string,
  quantity: number,
  database: Database,
) => {
  const [stock] = await database
    .update(inventoryStock)
    .set({
      quantityAllocated: sql`${inventoryStock.quantityAllocated} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryStock.id, id),
        sql`${inventoryStock.quantityOnHand} - ${inventoryStock.quantityAllocated} >= ${quantity}`,
      ),
    )
    .returning();

  return stock ?? null;
};

export const releaseStock = async (
  id: string,
  quantity: number,
  database: Database,
) => {
  const [stock] = await database
    .update(inventoryStock)
    .set({
      quantityAllocated: sql`${inventoryStock.quantityAllocated} - ${quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryStock.id, id),
        sql`${inventoryStock.quantityAllocated} >= ${quantity}`,
      ),
    )
    .returning();

  return stock ?? null;
};

export const allocateStockTransaction = (
  stock: typeof inventoryStock.$inferSelect,
  input: {
    quantity: number;
    actorId: string;
    reference?: string;
  },
  reorderLevel: number,
  createStockLowEvent: (
    previousStock: { quantityOnHand: number; quantityAllocated: number },
    currentStock: { productId: string; locationId: string; quantityOnHand: number; quantityAllocated: number },
    reorderLevel: number,
    database: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<unknown>,
) =>
  db.transaction(async (tx) => {
    const updatedStock = await allocateStock(stock.id, input.quantity, tx);
    if (!updatedStock)
      throw new AppError("Insufficient available stock", 409, [
        { field: "quantity", message: "Insufficient available stock" },
      ]);
    await tx.insert(inventoryAuditLogs).values({
      productId: stock.productId,
      locationId: stock.locationId,
      action: "STOCK_ALLOCATED",
      actorId: input.actorId,
      details: {
        previousQuantityAllocated: stock.quantityAllocated,
        newQuantityAllocated: updatedStock.quantityAllocated,
        quantity: input.quantity,
        reference: input.reference,
      },
    });
    const stockLowEvent = await createStockLowEvent(
      stock,
      updatedStock,
      reorderLevel,
      tx,
    );
    return {
      stock: {
        ...updatedStock,
        quantityAvailable:
          updatedStock.quantityOnHand - updatedStock.quantityAllocated,
      },
      stockLowEvent,
    };
  });

export const releaseStockTransaction = (
  stock: typeof inventoryStock.$inferSelect,
  input: {
    quantity: number;
    actorId: string;
    reference?: string;
  },
) =>
  db.transaction(async (tx) => {
    const updatedStock = await releaseStock(stock.id, input.quantity, tx);
    if (!updatedStock)
      throw new AppError("Cannot release more than allocated stock", 409, [
        {
          field: "quantity",
          message: "Cannot release more than allocated stock",
        },
      ]);
    await tx.insert(inventoryAuditLogs).values({
      productId: stock.productId,
      locationId: stock.locationId,
      action: "STOCK_RELEASED",
      actorId: input.actorId,
      details: {
        previousQuantityAllocated: stock.quantityAllocated,
        newQuantityAllocated: updatedStock.quantityAllocated,
        quantity: input.quantity,
        reference: input.reference,
      },
    });
    return {
      ...updatedStock,
      quantityAvailable:
        updatedStock.quantityOnHand - updatedStock.quantityAllocated,
    };
  });

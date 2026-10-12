import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseBinBalances, warehouseBins, warehouseMovements } from "../../db/schema/warehouse.js";

export async function findStock(query: { locationId: string; productId?: string; binId?: string; disposition?: "SELLABLE" | "QUARANTINED" | "DISCREPANCY"; page: number; pageSize: number }) {
  const filters = [eq(warehouseBins.locationId, query.locationId)];
  if (query.productId) filters.push(eq(warehouseBinBalances.productId, query.productId));
  if (query.binId) filters.push(eq(warehouseBinBalances.binId, query.binId));
  if (query.disposition) filters.push(eq(warehouseBinBalances.disposition, query.disposition));
  return db.select({ balanceId: warehouseBinBalances.id, binId: warehouseBins.id, binCode: warehouseBins.code, binName: warehouseBins.name, binType: warehouseBins.binType, productId: warehouseBinBalances.productId, disposition: warehouseBinBalances.disposition, quantity: warehouseBinBalances.quantity, reservedQuantity: warehouseBinBalances.reservedQuantity, availableQuantity: sql<number>`${warehouseBinBalances.quantity} - ${warehouseBinBalances.reservedQuantity}`, updatedAt: warehouseBinBalances.updatedAt })
    .from(warehouseBinBalances).innerJoin(warehouseBins, eq(warehouseBins.id, warehouseBinBalances.binId))
    .where(and(...filters)).orderBy(asc(warehouseBins.code), asc(warehouseBinBalances.productId)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
}

export async function findMovements(query: { locationId: string; productId?: string; binId?: string; movementType?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const filters = [eq(warehouseMovements.locationId, query.locationId)];
  if (query.productId) filters.push(eq(warehouseMovements.productId, query.productId));
  if (query.movementType) filters.push(eq(warehouseMovements.movementType, query.movementType as typeof warehouseMovements.$inferSelect.movementType));
  if (query.from) filters.push(gte(warehouseMovements.createdAt, new Date(query.from)));
  if (query.to) filters.push(lte(warehouseMovements.createdAt, new Date(query.to)));
  if (query.binId) filters.push(or(eq(warehouseMovements.sourceBinId, query.binId), eq(warehouseMovements.destinationBinId, query.binId))!);
  return db.select().from(warehouseMovements).where(and(...filters)).orderBy(desc(warehouseMovements.createdAt), desc(warehouseMovements.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
}

export function findSellableQuantities(locationId: string) {
  return db.select({ productId: warehouseBinBalances.productId, quantity: sql<number>`sum(${warehouseBinBalances.quantity})` })
    .from(warehouseBinBalances).innerJoin(warehouseBins, eq(warehouseBins.id, warehouseBinBalances.binId))
    .where(and(eq(warehouseBins.locationId, locationId), eq(warehouseBinBalances.disposition, "SELLABLE"))).groupBy(warehouseBinBalances.productId);
}

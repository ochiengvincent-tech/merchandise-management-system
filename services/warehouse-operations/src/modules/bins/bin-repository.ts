import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins } from "../../db/schema/warehouse.js";

export function findBins(locationId: string, filters: { status?: "ACTIVE" | "INACTIVE"; search?: string }) {
  const conditions = [eq(warehouseBins.locationId, locationId)];
  if (filters.status) conditions.push(eq(warehouseBins.status, filters.status));
  if (filters.search) conditions.push(ilike(warehouseBins.name, `%${filters.search}%`));
  return db.select().from(warehouseBins).where(and(...conditions)).orderBy(asc(warehouseBins.code));
}

export async function insertBin(input: { locationId: string; code: string; name: string; binType: "STORAGE" | "PICK_FACE" | "QUARANTINE"; zone?: string; aisle?: string; rack?: string; shelf?: string; capacity?: number; actorId: string }) {
  return db.transaction(async (tx) => {
    const { actorId, ...values } = input;
    const [bin] = await tx.insert(warehouseBins).values(values).returning();
    if (!bin) throw new Error("Bin was not created");
    await tx.insert(warehouseAuditLogs).values({ action: "BIN_CREATED", actorId, locationId: input.locationId, binId: bin.id, details: { after: bin } });
    return bin;
  });
}

export async function findBin(binId: string) {
  const [bin] = await db.select().from(warehouseBins).where(eq(warehouseBins.id, binId)).limit(1);
  if (!bin) return null;
  const balances = await db.select({ id: warehouseBinBalances.id, productId: warehouseBinBalances.productId, disposition: warehouseBinBalances.disposition, quantity: warehouseBinBalances.quantity, reservedQuantity: warehouseBinBalances.reservedQuantity, availableQuantity: sql<number>`${warehouseBinBalances.quantity} - ${warehouseBinBalances.reservedQuantity}`, updatedAt: warehouseBinBalances.updatedAt }).from(warehouseBinBalances).where(eq(warehouseBinBalances.binId, binId));
  return { bin, balances };
}

export async function findBinForUpdate(binId: string) {
  const [bin] = await db.select().from(warehouseBins).where(eq(warehouseBins.id, binId)).limit(1);
  if (!bin) return null;
  const [balance] = await db.select({ quantity: sql<number>`coalesce(sum(${warehouseBinBalances.quantity}), 0)` }).from(warehouseBinBalances).where(eq(warehouseBinBalances.binId, binId));
  return { bin, quantity: Number(balance?.quantity ?? 0) };
}

export function saveBinUpdate(input: { binId: string; actorId: string; locationId: string; before: typeof warehouseBins.$inferSelect; changes: Partial<Pick<typeof warehouseBins.$inferInsert, "name" | "status" | "zone" | "aisle" | "rack" | "shelf" | "capacity">> }) {
  return db.transaction(async (tx) => {
    const [after] = await tx.update(warehouseBins).set({ ...input.changes, updatedAt: new Date() }).where(eq(warehouseBins.id, input.binId)).returning();
    if (!after) return null;
    await tx.insert(warehouseAuditLogs).values({ action: "BIN_UPDATED", actorId: input.actorId, locationId: input.locationId, binId: input.binId, details: { before: input.before, after } });
    return after;
  });
}

import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins, warehouseBootstraps, warehouseMovements } from "../../db/schema/warehouse.js";

export async function findBootstrap(locationId: string) {
  const [bootstrap] = await db.select().from(warehouseBootstraps).where(eq(warehouseBootstraps.locationId, locationId)).limit(1);
  return bootstrap ?? null;
}

export async function insertBootstrap(locationId: string, actorId: string, stockRows: { id: string; productId: string; quantityOnHand: number }[]) {
  return db.transaction(async (tx) => {
    const [bin] = await tx.insert(warehouseBins).values({ locationId, code: "__UNASSIGNED__", name: "Unassigned opening stock", binType: "UNASSIGNED", status: "ACTIVE", systemManaged: true }).onConflictDoUpdate({ target: [warehouseBins.locationId, warehouseBins.code], set: { updatedAt: new Date() } }).returning();
    if (!bin) throw new Error("Could not create the unassigned stock bin");
    for (const stock of stockRows) {
      if (stock.quantityOnHand <= 0) continue;
      await tx.insert(warehouseBinBalances).values({ binId: bin.id, productId: stock.productId, disposition: "SELLABLE", quantity: stock.quantityOnHand }).onConflictDoUpdate({ target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition], set: { quantity: sql`${warehouseBinBalances.quantity} + ${stock.quantityOnHand}`, updatedAt: new Date() } });
      await tx.insert(warehouseMovements).values({ idempotencyKey: randomUUID(), movementType: "OPENING_BALANCE", productId: stock.productId, quantity: stock.quantityOnHand, disposition: "SELLABLE", sourceBinId: null, destinationBinId: bin.id, locationId, referenceType: "INVENTORY_BOOTSTRAP", referenceId: stock.id, actorId, reason: "Opening balance imported from Inventory" });
    }
    const sourceTotalUnits = stockRows.reduce((total, stock) => total + stock.quantityOnHand, 0);
    await tx.insert(warehouseBootstraps).values({ locationId, sourceStockCount: stockRows.length, sourceTotalUnits, varianceCount: 0, status: "COMPLETED" });
    await tx.insert(warehouseAuditLogs).values({ action: "BOOTSTRAP_COMPLETED", actorId, locationId, binId: bin.id, details: { sourceStockCount: stockRows.length, sourceTotalUnits, source: "Inventory API" } });
    return bin;
  });
}

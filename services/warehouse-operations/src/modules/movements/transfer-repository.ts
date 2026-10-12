import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins, warehouseMovements, warehouseOutboxEvents } from "../../db/schema/warehouse.js";

type Movement = typeof warehouseMovements.$inferSelect;
type Bin = typeof warehouseBins.$inferSelect;
type Balance = typeof warehouseBinBalances.$inferSelect;

export async function withTransferTransaction<T>(input: { idempotencyKey: string; locationId: string; productId: string; sourceBinId: string; destinationBinId: string; quantity: number; disposition: "SELLABLE" | "QUARANTINED" | "DISCREPANCY"; actorId: string; reason?: string }, operation: (state: { previous?: Movement; sourceBin?: Bin; destinationBin?: Bin; source?: Balance; save: () => Promise<Movement> }) => Promise<T>) {
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(warehouseMovements).where(eq(warehouseMovements.idempotencyKey, input.idempotencyKey)).limit(1);
    const [sourceBin] = await tx.select().from(warehouseBins).where(and(eq(warehouseBins.id, input.sourceBinId), eq(warehouseBins.locationId, input.locationId), eq(warehouseBins.status, "ACTIVE"))).limit(1);
    const [destinationBin] = await tx.select().from(warehouseBins).where(and(eq(warehouseBins.id, input.destinationBinId), eq(warehouseBins.locationId, input.locationId), eq(warehouseBins.status, "ACTIVE"))).limit(1);
    const [source] = await tx.select().from(warehouseBinBalances).where(and(eq(warehouseBinBalances.binId, input.sourceBinId), eq(warehouseBinBalances.productId, input.productId), eq(warehouseBinBalances.disposition, input.disposition))).for("update").limit(1);

    const save = async () => {
      if (!sourceBin || !destinationBin || !source) throw new Error("Transfer state was not loaded");
      await tx.update(warehouseBinBalances).set({ quantity: sql`${warehouseBinBalances.quantity} - ${input.quantity}`, updatedAt: new Date() }).where(eq(warehouseBinBalances.id, source.id));
      await tx.insert(warehouseBinBalances).values({ binId: destinationBin.id, productId: input.productId, disposition: input.disposition, quantity: input.quantity }).onConflictDoUpdate({ target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition], set: { quantity: sql`${warehouseBinBalances.quantity} + ${input.quantity}`, updatedAt: new Date() } });
      const [movement] = await tx.insert(warehouseMovements).values({ idempotencyKey: input.idempotencyKey, movementType: input.disposition === "SELLABLE" ? "BIN_TRANSFER" : "QUARANTINE_TRANSFER", productId: input.productId, quantity: input.quantity, disposition: input.disposition, sourceBinId: sourceBin.id, destinationBinId: destinationBin.id, locationId: input.locationId, referenceType: "BIN_TRANSFER", actorId: input.actorId, reason: input.reason }).returning();
      if (!movement) throw new Error("Bin transfer was not recorded");
      await tx.insert(warehouseAuditLogs).values({ action: input.disposition === "SELLABLE" ? "BIN_TRANSFERRED" : "QUARANTINE_TRANSFERRED", actorId: input.actorId, locationId: input.locationId, binId: destinationBin.id, movementId: movement.id, details: { productId: input.productId, quantity: input.quantity, disposition: input.disposition, sourceBinId: sourceBin.id, destinationBinId: destinationBin.id, reason: input.reason ?? null } });
      await tx.insert(warehouseOutboxEvents).values({ eventId: randomUUID(), eventType: "WarehouseBinTransferred", aggregateType: "WarehouseMovement", aggregateId: movement.id, payload: { movementId: movement.id, locationId: input.locationId, productId: input.productId, quantity: input.quantity, disposition: input.disposition, sourceBinId: input.sourceBinId, destinationBinId: input.destinationBinId, actorId: input.actorId, occurredAt: movement.createdAt } });
      return movement;
    };
    return operation({ previous, sourceBin, destinationBin, source, save });
  });
}

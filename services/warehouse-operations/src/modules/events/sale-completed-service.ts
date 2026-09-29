import { createHash } from "node:crypto";
import { and, eq, asc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins, warehouseMovements, warehouseProcessedEvents } from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";

const stableUuid = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
};

export async function processSaleCompletedWarehouseEvent(input: {
  eventId: string; saleId: string; actorId: string; locationId: string; warehouseManaged: boolean;
  lines: Array<{ productId: string; quantity: number }>;
}) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(warehouseProcessedEvents).values({ eventId: input.eventId, eventType: "SaleCompleted" }).onConflictDoNothing({ target: warehouseProcessedEvents.eventId }).returning();
    if (!inserted) return;
    if (!input.warehouseManaged) return;
    const grouped = new Map<string, number>();
    for (const line of input.lines) grouped.set(line.productId, (grouped.get(line.productId) ?? 0) + line.quantity);
    for (const [productId, total] of grouped) {
      const bins = await tx.select({ balance: warehouseBinBalances, bin: warehouseBins })
        .from(warehouseBinBalances).innerJoin(warehouseBins, eq(warehouseBinBalances.binId, warehouseBins.id))
        .where(and(eq(warehouseBins.locationId, input.locationId), eq(warehouseBins.status, "ACTIVE"), eq(warehouseBinBalances.productId, productId), eq(warehouseBinBalances.disposition, "SELLABLE")))
        .orderBy(sql`CASE WHEN ${warehouseBins.binType} = 'PICK_FACE' THEN 0 WHEN ${warehouseBins.binType} = 'STORAGE' THEN 1 ELSE 2 END`, asc(warehouseBins.code))
        .for("update");
      let remaining = total;
      for (const row of bins) {
        const available = row.balance.quantity - row.balance.reservedQuantity;
        const take = Math.min(available, remaining);
        if (take <= 0) continue;
        await tx.update(warehouseBinBalances).set({ quantity: sql`${warehouseBinBalances.quantity} - ${take}`, updatedAt: new Date() }).where(eq(warehouseBinBalances.id, row.balance.id));
        const movementKey = stableUuid(`${input.eventId}:${productId}:${row.bin.id}`);
        const [movement] = await tx.insert(warehouseMovements).values({
          idempotencyKey: movementKey, movementType: "SALE_CONSUMPTION", productId, quantity: take,
          disposition: "SELLABLE", sourceBinId: row.bin.id, destinationBinId: null, locationId: input.locationId,
          referenceType: "SALE", referenceId: input.saleId, actorId: input.actorId, reason: "Retail sale",
        }).returning();
        await tx.insert(warehouseAuditLogs).values({ action: "SALE_STOCK_CONSUMED", actorId: input.actorId, locationId: input.locationId, binId: row.bin.id, movementId: movement?.id, details: { saleId: input.saleId, eventId: input.eventId, productId, quantity: take } });
        remaining -= take;
        if (remaining === 0) break;
      }
      if (remaining > 0) throw new AppError("Warehouse sellable bin stock is lower than Inventory's reserved sale quantity", 409, [{ field: "stock", message: `Unable to map ${remaining} sold units of product ${productId} to available sellable bins.` }]);
    }
  });
}

export async function processSaleReturnedWarehouseEvent(input: {
  eventId: string; returnId: string; saleId: string; actorId: string; locationId: string; warehouseManaged: boolean;
  lines: Array<{ productId: string; quantity: number; disposition: "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN" }>;
}) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(warehouseProcessedEvents).values({ eventId: input.eventId, eventType: "SaleReturned" }).onConflictDoNothing({ target: warehouseProcessedEvents.eventId }).returning();
    if (!inserted || !input.warehouseManaged) return;
    const groups = new Map<string, { productId: string; quantity: number; disposition: "SELLABLE" | "QUARANTINED" }>();
    for (const line of input.lines) {
      if (line.disposition === "NO_STOCK_RETURN") continue;
      const disposition = line.disposition === "RESTOCK_SELLABLE" ? "SELLABLE" : "QUARANTINED";
      const key = `${line.productId}:${disposition}`;
      const existing = groups.get(key);
      groups.set(key, { productId: line.productId, quantity: (existing?.quantity ?? 0) + line.quantity, disposition });
    }
    for (const group of groups.values()) {
      const binCode = group.disposition === "SELLABLE" ? "__UNASSIGNED__" : "__RETURNS_QUARANTINE__";
      if (group.disposition === "QUARANTINED") {
        await tx.insert(warehouseBins).values({ locationId: input.locationId, code: binCode, name: "Returned goods quarantine", binType: "QUARANTINE", systemManaged: true }).onConflictDoNothing({ target: [warehouseBins.locationId, warehouseBins.code] });
      }
      const [bin] = await tx.select().from(warehouseBins).where(and(eq(warehouseBins.locationId, input.locationId), eq(warehouseBins.code, binCode), eq(warehouseBins.status, "ACTIVE"))).limit(1);
      if (!bin) throw new AppError(`Warehouse return bin ${binCode} is unavailable`, 409);
      await tx.insert(warehouseBinBalances).values({ binId: bin.id, productId: group.productId, disposition: group.disposition, quantity: group.quantity }).onConflictDoUpdate({
        target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition],
        set: { quantity: sql`${warehouseBinBalances.quantity} + ${group.quantity}`, updatedAt: new Date() },
      });
      const movementIdempotencyKey = stableUuid(`${input.eventId}:${group.productId}:${group.disposition}`);
      const [movement] = await tx.insert(warehouseMovements).values({
        idempotencyKey: movementIdempotencyKey, movementType: "RETURN_INTAKE", productId: group.productId, quantity: group.quantity,
        disposition: group.disposition, sourceBinId: null, destinationBinId: bin.id, locationId: input.locationId,
        referenceType: "SALE_RETURN", referenceId: input.returnId, actorId: input.actorId, reason: `Return from sale ${input.saleId}`,
      }).returning();
      await tx.insert(warehouseAuditLogs).values({ action: "SALE_RETURN_INTAKED", actorId: input.actorId, locationId: input.locationId, binId: bin.id, movementId: movement?.id, details: { saleId: input.saleId, returnId: input.returnId, productId: group.productId, quantity: group.quantity, disposition: group.disposition } });
    }
  });
}

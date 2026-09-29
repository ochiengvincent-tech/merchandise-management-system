import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireManagedWarehouseLocation } from "../../clients/inventory-client.js";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins, warehouseMovements, warehouseOutboxEvents } from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";

const router: Router = Router();

router.post("/movements", async (req, res) => {
  const parsedKey = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!parsedKey.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this bin transfer." }]);
  const data = z.object({
    locationId: z.uuid(), productId: z.uuid(), sourceBinId: z.uuid(), destinationBinId: z.uuid(),
    quantity: z.number().int().positive(), disposition: z.enum(["SELLABLE", "QUARANTINED", "DISCREPANCY"]),
    actorId: z.uuid(), reason: z.string().trim().max(255).optional(),
  }).parse(req.body);
  if (data.sourceBinId === data.destinationBinId) throw new AppError("Choose two different bins", 400, [{ field: "destinationBinId", message: "Source and destination must be different bins." }]);
  await requireManagedWarehouseLocation(data.locationId);

  const result = await db.transaction(async (tx) => {
    const [previous] = await tx.select().from(warehouseMovements).where(eq(warehouseMovements.idempotencyKey, parsedKey.data)).limit(1);
    if (previous) {
      const same = previous.movementType === (data.disposition === "SELLABLE" ? "BIN_TRANSFER" : "QUARANTINE_TRANSFER")
        && previous.locationId === data.locationId && previous.productId === data.productId
        && previous.sourceBinId === data.sourceBinId && previous.destinationBinId === data.destinationBinId
        && previous.quantity === data.quantity && previous.disposition === data.disposition;
      if (!same) throw new AppError("Idempotency-Key was already used with different movement data", 409);
      return { movement: previous, duplicate: true };
    }
    const [sourceBin] = await tx.select().from(warehouseBins).where(and(eq(warehouseBins.id, data.sourceBinId), eq(warehouseBins.locationId, data.locationId), eq(warehouseBins.status, "ACTIVE"))).limit(1);
    const [destinationBin] = await tx.select().from(warehouseBins).where(and(eq(warehouseBins.id, data.destinationBinId), eq(warehouseBins.locationId, data.locationId), eq(warehouseBins.status, "ACTIVE"))).limit(1);
    if (!sourceBin || !destinationBin) throw new AppError("Choose active bins in this location", 400);
    const supportedTypes = data.disposition === "SELLABLE" ? ["STORAGE", "PICK_FACE"] : data.disposition === "QUARANTINED" ? ["QUARANTINE"] : ["DISCREPANCY"];
    if (!supportedTypes.includes(sourceBin.binType) || !supportedTypes.includes(destinationBin.binType)) {
      throw new AppError("Bins do not support the selected stock disposition", 400, [{ field: "disposition", message: "Sellable, quarantined, and discrepancy stock must stay in compatible bins." }]);
    }
    const [source] = await tx.select().from(warehouseBinBalances).where(and(eq(warehouseBinBalances.binId, sourceBin.id), eq(warehouseBinBalances.productId, data.productId), eq(warehouseBinBalances.disposition, data.disposition))).for("update").limit(1);
    if (!source || source.quantity - source.reservedQuantity < data.quantity) throw new AppError("Source bin does not have enough available stock", 409, [{ field: "quantity", message: "Reduce the transfer quantity or choose another source bin." }]);
    await tx.update(warehouseBinBalances).set({ quantity: sql`${warehouseBinBalances.quantity} - ${data.quantity}`, updatedAt: new Date() }).where(eq(warehouseBinBalances.id, source.id));
    await tx.insert(warehouseBinBalances).values({ binId: destinationBin.id, productId: data.productId, disposition: data.disposition, quantity: data.quantity }).onConflictDoUpdate({
      target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition],
      set: { quantity: sql`${warehouseBinBalances.quantity} + ${data.quantity}`, updatedAt: new Date() },
    });
    const [movement] = await tx.insert(warehouseMovements).values({
      idempotencyKey: parsedKey.data, movementType: data.disposition === "SELLABLE" ? "BIN_TRANSFER" : "QUARANTINE_TRANSFER",
      productId: data.productId, quantity: data.quantity, disposition: data.disposition,
      sourceBinId: sourceBin.id, destinationBinId: destinationBin.id, locationId: data.locationId,
      referenceType: "BIN_TRANSFER", actorId: data.actorId, reason: data.reason,
    }).returning();
    if (!movement) throw new Error("Bin transfer was not recorded");
    await tx.insert(warehouseAuditLogs).values({
      action: data.disposition === "SELLABLE" ? "BIN_TRANSFERRED" : "QUARANTINE_TRANSFERRED",
      actorId: data.actorId, locationId: data.locationId, binId: destinationBin.id, movementId: movement.id,
      details: { productId: data.productId, quantity: data.quantity, disposition: data.disposition, sourceBinId: sourceBin.id, destinationBinId: destinationBin.id, reason: data.reason ?? null },
    });
    {
      await tx.insert(warehouseOutboxEvents).values({
        eventId: randomUUID(), eventType: "WarehouseBinTransferred", aggregateType: "WarehouseMovement", aggregateId: movement.id,
        payload: { movementId: movement.id, locationId: data.locationId, productId: data.productId, quantity: data.quantity, disposition: data.disposition, sourceBinId: sourceBin.id, destinationBinId: destinationBin.id, actorId: data.actorId, occurredAt: movement.createdAt },
      });
    }
    return { movement, duplicate: false };
  });
  return res.status(result.duplicate ? 200 : 201).json({ data: result });
});

export { router as transferRouter };

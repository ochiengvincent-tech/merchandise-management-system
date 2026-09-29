import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  warehouseAdjustmentCommands,
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
} from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";
import { getInventoryProduct, requireManagedWarehouseLocation, submitInventoryWarehouseAdjustment } from "../../clients/inventory-client.js";

export type SubmitAdjustment = {
  idempotencyKey: string;
  locationId: string;
  productId: string;
  sourceBinId: string;
  quantityChange: number;
  reason: string;
  actorId: string;
};

function requestHash(input: SubmitAdjustment) {
  return createHash("sha256").update(JSON.stringify({
    locationId: input.locationId,
    productId: input.productId,
    sourceBinId: input.sourceBinId,
    quantityChange: input.quantityChange,
    reason: input.reason,
    actorId: input.actorId,
  })).digest("hex");
}

export async function submitWarehouseAdjustment(input: SubmitAdjustment) {
  await requireManagedWarehouseLocation(input.locationId);
  const product = await getInventoryProduct(input.productId);
  if (product.status !== "ACTIVE") throw new AppError("Inactive products cannot be adjusted", 409);
  const hash = requestHash(input);

  const command = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existing] = await tx.select().from(warehouseAdjustmentCommands)
      .where(eq(warehouseAdjustmentCommands.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.requestHash !== hash) throw new AppError("Idempotency-Key was already used with different adjustment data", 409);
      return existing;
    }

    const [bin] = await tx.select().from(warehouseBins)
      .where(and(
        eq(warehouseBins.id, input.sourceBinId),
        eq(warehouseBins.locationId, input.locationId),
        eq(warehouseBins.status, "ACTIVE"),
      )).limit(1);
    if (!bin || !["RECEIVING", "STORAGE", "PICK_FACE", "UNASSIGNED"].includes(bin.binType)) {
      throw new AppError("Choose an active sellable bin in this location", 400, [{ field: "sourceBinId", message: "The source must be an active receiving, storage, pick-face, or unassigned bin." }]);
    }
    const [balance] = await tx.select().from(warehouseBinBalances)
      .where(and(
        eq(warehouseBinBalances.binId, input.sourceBinId),
        eq(warehouseBinBalances.productId, input.productId),
        eq(warehouseBinBalances.disposition, "SELLABLE"),
      )).for("update").limit(1);
    if (input.quantityChange < 0 && (!balance || balance.quantity - balance.reservedQuantity < Math.abs(input.quantityChange))) {
      throw new AppError("Adjustment exceeds available sellable quantity in this bin", 409, [{ field: "quantityChange", message: "Reduce the quantity or choose a bin with enough unreserved units." }]);
    }
    const [created] = await tx.insert(warehouseAdjustmentCommands).values({
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
      locationId: input.locationId,
      productId: input.productId,
      sourceBinId: input.sourceBinId,
      quantityChange: input.quantityChange,
      reservedQuantity: input.quantityChange < 0 ? Math.abs(input.quantityChange) : 0,
      reason: input.reason,
      actorId: input.actorId,
      status: "PENDING",
    }).returning();
    if (!created) throw new Error("Warehouse adjustment command was not created");
    if (input.quantityChange < 0 && balance) {
      await tx.update(warehouseBinBalances)
        .set({ reservedQuantity: sql`${warehouseBinBalances.reservedQuantity} + ${Math.abs(input.quantityChange)}`, updatedAt: new Date() })
        .where(eq(warehouseBinBalances.id, balance.id));
    }
    await tx.insert(warehouseAuditLogs).values({
      action: "INVENTORY_ADJUSTMENT_REQUESTED",
      actorId: input.actorId,
      locationId: input.locationId,
      binId: input.sourceBinId,
      details: { warehouseCommandId: created.id, productId: input.productId, quantityChange: input.quantityChange, reason: input.reason, status: "PENDING" },
    });
    return created;
  });

  if (command.status === "SYNCED") return { data: command, status: "SYNCED" };
  if (command.status === "FAILED") throw new AppError("This adjustment command was rejected. Create a new command with a new idempotency key.", 409);

  try {
    await submitInventoryWarehouseAdjustment({
      productId: command.productId,
      locationId: command.locationId,
      quantityChange: command.quantityChange,
      reason: command.reason,
      createdBy: command.actorId,
      idempotencyKey: command.idempotencyKey,
      warehouseCommandId: command.id,
      sourceBinId: command.sourceBinId,
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      await db.transaction(async (tx) => {
        await tx.update(warehouseAdjustmentCommands).set({ status: "FAILED", reservedQuantity: 0, updatedAt: new Date() }).where(eq(warehouseAdjustmentCommands.id, command.id));
        if (command.quantityChange < 0) {
          await tx.update(warehouseBinBalances).set({ reservedQuantity: sql`GREATEST(${warehouseBinBalances.reservedQuantity} - ${Math.abs(command.quantityChange)}, 0)`, updatedAt: new Date() })
            .where(and(eq(warehouseBinBalances.binId, command.sourceBinId), eq(warehouseBinBalances.productId, command.productId), eq(warehouseBinBalances.disposition, "SELLABLE")));
        }
      });
    }
    if (error instanceof AppError) throw error;
    throw new AppError("Inventory adjustment is pending. Retry using the same Idempotency-Key.", 503);
  }

  return { data: command, status: "PENDING", message: "Inventory accepted the adjustment. Warehouse bin stock updates after its confirmation event is processed." };
}

export async function getWarehouseAdjustment(id: string) {
  const [command] = await db.select().from(warehouseAdjustmentCommands)
    .where(eq(warehouseAdjustmentCommands.id, id)).limit(1);
  if (!command) throw new AppError("Warehouse adjustment not found", 404);
  return command;
}

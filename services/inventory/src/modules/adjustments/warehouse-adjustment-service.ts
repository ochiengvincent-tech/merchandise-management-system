import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryLocations } from "../../db/schema/inventory-locations.js";
import { inventoryOutboxEvents } from "../../db/schema/inventory-outbox-events.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { findStockByProductAndLocation } from "../stock/stock-repository.js";
import type { z } from "zod";
import { warehouseAdjustmentSchema } from "./adjustment-schema.js";
import { allocateCarryingValue, recordValuationChange, unitCostFromCarryingValue, valueAtAverage } from "../events/valuation-outbox.js";

export async function createWarehouseAdjustmentService(
  input: z.infer<typeof warehouseAdjustmentSchema>,
) {
  const requestHash = JSON.stringify({
    productId: input.productId,
    locationId: input.locationId,
    quantityChange: input.quantityChange,
    reason: input.reason,
    createdBy: input.createdBy,
    warehouseCommandId: input.warehouseCommandId,
    sourceBinId: input.sourceBinId,
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existing] = await tx.select().from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      const existingHash = JSON.stringify({
        productId: existing.productId,
        locationId: existing.locationId,
        quantityChange: existing.quantityChange,
        reason: existing.reason,
        createdBy: existing.createdBy,
        warehouseCommandId: existing.warehouseCommandId,
        sourceBinId: existing.sourceBinId,
      });
      if (existingHash !== requestHash) throw new AppError("Idempotency-Key was already used with different adjustment data", 409);
      const [stock] = await tx.select().from(inventoryStock)
        .where(and(eq(inventoryStock.productId, input.productId), eq(inventoryStock.locationId, input.locationId))).limit(1);
      return { adjustment: existing, stock: stock ?? null, duplicate: true };
    }

    const [location] = await tx.select().from(inventoryLocations)
      .where(eq(inventoryLocations.id, input.locationId)).limit(1);
    if (!location) throw new AppError("Inventory location not found", 404);
    if (!location.warehouseManaged) throw new AppError("This location is not managed by Warehouse Operations", 409);
    if (location.status !== "ACTIVE") throw new AppError("Inventory location is inactive", 409);
    const product = await findProductById(input.productId);
    if (!product || product.status !== "ACTIVE") throw new AppError("Active product not found", 404);
    const existingStock = await findStockByProductAndLocation(input.productId, input.locationId);
    if (!existingStock) throw new AppError("Stock record not found", 404);

    const [lockedStock] = await tx.select().from(inventoryStock).where(eq(inventoryStock.id, existingStock.id)).for("update").limit(1);
    if (!lockedStock) throw new AppError("Stock record not found", 404);
    const previousQuantityOnHand = lockedStock.quantityOnHand;
    const newQuantityOnHand = previousQuantityOnHand + input.quantityChange;
    if (newQuantityOnHand < lockedStock.quantityAllocated || newQuantityOnHand < 0) throw new AppError("Adjustment would reduce stock below allocated quantity", 409, [{ field: "quantityChange", message: "Review the latest stock and allocated quantities, then try again." }]);
    const quantity = Math.abs(input.quantityChange);
    const valuation = input.quantityChange > 0
      ? valueAtAverage(lockedStock.carryingValueMinor, quantity, previousQuantityOnHand)
      : previousQuantityOnHand > 0
        ? allocateCarryingValue(lockedStock.carryingValueMinor, quantity, previousQuantityOnHand)
        : 0n;
    const newCarryingValueMinor = BigInt(lockedStock.carryingValueMinor) + (input.quantityChange > 0 ? valuation : -valuation);
    const [stock] = await tx.update(inventoryStock).set({
      quantityOnHand: newQuantityOnHand,
      carryingValueMinor: newCarryingValueMinor.toString(),
      unitCost: unitCostFromCarryingValue(newCarryingValueMinor, newQuantityOnHand),
      updatedAt: new Date(),
    }).where(eq(inventoryStock.id, lockedStock.id)).returning();
    if (!stock) throw new Error("Inventory warehouse adjustment stock was not updated");

    const [adjustment] = await tx.insert(inventoryAdjustments).values({
      productId: input.productId,
      locationId: input.locationId,
      quantityChange: input.quantityChange,
      reason: input.reason,
      reference: `Warehouse command ${input.warehouseCommandId}`,
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
      warehouseCommandId: input.warehouseCommandId,
      sourceBinId: input.sourceBinId,
    }).returning();
    if (!adjustment) throw new Error("Inventory adjustment was not created");

    await tx.insert(inventoryAuditLogs).values({
      productId: input.productId,
      locationId: input.locationId,
      action: "WAREHOUSE_STOCK_ADJUSTED",
      actorId: input.createdBy,
      details: {
        adjustmentId: adjustment.id,
        warehouseCommandId: input.warehouseCommandId,
        sourceBinId: input.sourceBinId,
        previousQuantityOnHand,
        newQuantityOnHand,
        quantityChange: input.quantityChange,
        reason: input.reason,
      },
    });

    const isGain = input.quantityChange > 0;
    const isWriteOff = !isGain && /write.?off|shrink/i.test(input.reason);
    await recordValuationChange(tx, {
      stockId: existingStock.id,
      sourceType: "ADJUSTMENT",
      sourceId: adjustment.id,
      sourceEventId: adjustment.id,
      productId: input.productId,
      locationId: input.locationId,
      quantityDelta: input.quantityChange,
      carryingValueDeltaMinor: isGain ? valuation : -valuation,
      reason: isGain ? "ADJUSTMENT_GAIN" : isWriteOff ? "WRITE_OFF" : "ADJUSTMENT_LOSS",
    });

    const eventId = randomUUID();
    await tx.insert(inventoryOutboxEvents).values({
      eventId,
      eventType: "InventoryStockAdjusted",
      aggregateType: "InventoryAdjustment",
      aggregateId: adjustment.id,
      payload: {
        adjustmentId: adjustment.id,
        warehouseCommandId: input.warehouseCommandId,
        productId: input.productId,
        locationId: input.locationId,
        sourceBinId: input.sourceBinId,
        quantityChange: input.quantityChange,
        actorId: input.createdBy,
      },
      status: "PENDING",
      attempts: 0,
      occurredAt: adjustment.createdAt,
    });

    return { adjustment, stock, duplicate: false };
  });
}

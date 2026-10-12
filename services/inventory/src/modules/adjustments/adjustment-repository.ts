import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";
import {
  allocateCarryingValue,
  unitCostFromCarryingValue,
  valueAtAverage,
} from "../events/valuation-outbox.js";
import { recordValuationChange } from "../events/valuation-repository.js";

export const createAdjustment = async (
  data: typeof inventoryAdjustments.$inferInsert,
) => {
  const [adjustment] = await db
    .insert(inventoryAdjustments)
    .values(data)
    .returning();

  return adjustment;
};

export const findAdjustmentById = async (id: string) => {
  const [adjustment] = await db
    .select()
    .from(inventoryAdjustments)
    .where(eq(inventoryAdjustments.id, id))
    .limit(1);

  return adjustment ?? null;
};

export const createAdjustmentTransaction = (
  data: {
    productId: string;
    locationId: string;
    quantityChange: number;
    reason: string;
    reference?: string;
    createdBy: string;
  },
  stock: typeof inventoryStock.$inferSelect,
  reorderLevel: number,
  createStockLowEvent: (
    previousStock: { quantityOnHand: number; quantityAllocated: number },
    currentStock: { productId: string; locationId: string; quantityOnHand: number; quantityAllocated: number },
    reorderLevel: number,
    database: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<unknown>,
) =>
  db.transaction(async (tx) => {
    const [lockedStock] = await tx
      .select()
      .from(inventoryStock)
      .where(eq(inventoryStock.id, stock.id))
      .for("update")
      .limit(1);
    if (!lockedStock) throw new AppError("Stock record not found", 404);
    const previousQuantityOnHand = lockedStock.quantityOnHand;
    const newQuantityOnHand = previousQuantityOnHand + data.quantityChange;
    if (
      newQuantityOnHand < lockedStock.quantityAllocated ||
      newQuantityOnHand < 0
    ) {
      throw new AppError(
        "Adjustment would result in negative stock or reduce stock below allocated quantity",
        409,
        [
          {
            field: "quantityChange",
            message:
              "Review the latest stock and allocated quantities, then try again.",
          },
        ],
      );
    }
    const absoluteQuantityChange = Math.abs(data.quantityChange);
    const valuationDelta =
      data.quantityChange > 0
        ? valueAtAverage(
            lockedStock.carryingValueMinor,
            absoluteQuantityChange,
            previousQuantityOnHand,
          )
        : previousQuantityOnHand > 0
          ? allocateCarryingValue(
              lockedStock.carryingValueMinor,
              absoluteQuantityChange,
              previousQuantityOnHand,
            )
          : 0n;
    const newCarryingValueMinor =
      BigInt(lockedStock.carryingValueMinor) +
      (data.quantityChange > 0 ? valuationDelta : -valuationDelta);
    const [updatedStock] = await tx
      .update(inventoryStock)
      .set({
        quantityOnHand: newQuantityOnHand,
        carryingValueMinor: newCarryingValueMinor.toString(),
        unitCost: unitCostFromCarryingValue(
          newCarryingValueMinor,
          newQuantityOnHand,
        ),
        updatedAt: new Date(),
      })
      .where(eq(inventoryStock.id, lockedStock.id))
      .returning();
    if (!updatedStock)
      throw new Error("Inventory adjustment stock was not updated");

    const [adjustment] = await tx
      .insert(inventoryAdjustments)
      .values({
        productId: data.productId,
        locationId: data.locationId,
        quantityChange: data.quantityChange,
        reason: data.reason,
        reference: data.reference,
        createdBy: data.createdBy,
      })
      .returning();

    if (adjustment) {
      const isGain = data.quantityChange > 0;
      const isWriteOff = !isGain && /write.?off|shrink/i.test(data.reason);
      await recordValuationChange(tx, {
        stockId: stock.id,
        sourceType: "ADJUSTMENT",
        sourceId: adjustment.id,
        sourceEventId: adjustment.id,
        productId: data.productId,
        locationId: data.locationId,
        quantityDelta: data.quantityChange,
        carryingValueDeltaMinor: isGain ? valuationDelta : -valuationDelta,
        reason: isGain
          ? "ADJUSTMENT_GAIN"
          : isWriteOff
            ? "WRITE_OFF"
            : "ADJUSTMENT_LOSS",
      });
    }

    await tx.insert(inventoryAuditLogs).values({
      productId: data.productId,
      locationId: data.locationId,
      action: "STOCK_ADJUSTED",
      actorId: data.createdBy,
      details: {
        previousQuantityOnHand,
        newQuantityOnHand: updatedStock.quantityOnHand,
        quantityChange: data.quantityChange,
        reason: data.reason,
        reference: data.reference,
      },
    });

    const stockLowEvent = await createStockLowEvent(
      lockedStock,
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
      adjustment,
      stockLowEvent,
    };
  });

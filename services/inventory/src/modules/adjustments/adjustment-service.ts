import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import { findStockByProductAndLocation } from "../stock/stock-repository.js";
import { createStockLowEvent } from "../events/stock-low-event-service.js";
import { allocateCarryingValue, recordValuationChange, unitCostFromCarryingValue, valueAtAverage } from "../events/valuation-outbox.js";

export const createAdjustmentService = async (data: {
  productId: string;
  locationId: string;
  quantityChange: number;
  reason: string;
  reference?: string;
  createdBy: string;
}) => {
  const [product, location] = await Promise.all([
    findProductById(data.productId),
    findLocationById(data.locationId),
  ]);

  const errors = [];

  if (!product) {
    errors.push({
      field: "productId",
      message: "Product not found",
    });
  } else if (product.status === "INACTIVE") {
    errors.push({
      field: "productId",
      message: "Product is inactive",
    });
  }

  if (!location) {
    errors.push({
      field: "locationId",
      message: "Location not found",
    });
  } else if (location.status === "INACTIVE") {
    errors.push({
      field: "locationId",
      message: "Location is inactive",
    });
  }

  if (errors.length > 0) {
    throw new AppError("Validation failed", 400, errors);
  }

  if (!product || !location) {
    throw new Error("Validation failed");
  }

  if (location.warehouseManaged) {
    throw new AppError(
      "Stock adjustments for this location must be submitted through Warehouse Operations",
      409,
      [{
        field: "locationId",
        message: "Open Warehouse Operations and submit the adjustment from its source bin.",
      }],
    );
  }

  const stock = await findStockByProductAndLocation(
    data.productId,
    data.locationId,
  );

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record not found",
      },
    ]);
  }

  return db.transaction(async (tx) => {
    const [lockedStock] = await tx.select().from(inventoryStock).where(eq(inventoryStock.id, stock.id)).for("update").limit(1);
    if (!lockedStock) throw new AppError("Stock record not found", 404);
    const previousQuantityOnHand = lockedStock.quantityOnHand;
    const newQuantityOnHand = previousQuantityOnHand + data.quantityChange;
    if (newQuantityOnHand < lockedStock.quantityAllocated || newQuantityOnHand < 0) {
      throw new AppError("Adjustment would result in negative stock or reduce stock below allocated quantity", 409, [
        { field: "quantityChange", message: "Review the latest stock and allocated quantities, then try again." },
      ]);
    }
    const absoluteQuantityChange = Math.abs(data.quantityChange);
    const valuationDelta = data.quantityChange > 0
      ? valueAtAverage(lockedStock.carryingValueMinor, absoluteQuantityChange, previousQuantityOnHand)
      : previousQuantityOnHand > 0
        ? allocateCarryingValue(lockedStock.carryingValueMinor, absoluteQuantityChange, previousQuantityOnHand)
        : 0n;
    const newCarryingValueMinor = BigInt(lockedStock.carryingValueMinor) + (data.quantityChange > 0 ? valuationDelta : -valuationDelta);
    const [updatedStock] = await tx.update(inventoryStock).set({
      quantityOnHand: newQuantityOnHand,
      carryingValueMinor: newCarryingValueMinor.toString(),
      unitCost: unitCostFromCarryingValue(newCarryingValueMinor, newQuantityOnHand),
      updatedAt: new Date(),
    }).where(eq(inventoryStock.id, lockedStock.id)).returning();
    if (!updatedStock) throw new Error("Inventory adjustment stock was not updated");

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
      const delta = valuationDelta;
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
        carryingValueDeltaMinor: isGain ? delta : -delta,
        reason: isGain ? "ADJUSTMENT_GAIN" : isWriteOff ? "WRITE_OFF" : "ADJUSTMENT_LOSS",
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
      stock,
      updatedStock,
      product.reorderLevel,
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
};

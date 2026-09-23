import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import { findStockByProductAndLocation } from "../stock/stock-repository.js";
import { createStockLowEvent } from "../events/stock-low-event-service.js";

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

  const newQuantityOnHand = stock.quantityOnHand + data.quantityChange;

  if (newQuantityOnHand < 0) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantityChange",
        message: "Adjustment would result in negative stock",
      },
    ]);
  }

  if (stock.quantityAllocated > newQuantityOnHand) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantityChange",
        message: "Adjustment would reduce stock below allocated quantity",
      },
    ]);
  }

  return db.transaction(async (tx) => {
    const [updatedStock] = await tx
      .update(inventoryStock)
      .set({
        quantityOnHand: newQuantityOnHand,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryStock.id, stock.id),
          sql`${inventoryStock.quantityOnHand} + ${data.quantityChange} >= 0`,
          sql`${inventoryStock.quantityOnHand} + ${data.quantityChange} >= ${inventoryStock.quantityAllocated}`,
        ),
      )
      .returning();

    if (!updatedStock) {
      throw new Error("Failed to update stock");
    }

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

    await tx.insert(inventoryAuditLogs).values({
      productId: data.productId,
      locationId: data.locationId,
      action: "STOCK_ADJUSTED",
      actorId: data.createdBy,
      details: {
        previousQuantityOnHand: stock.quantityOnHand,
        newQuantityOnHand,
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

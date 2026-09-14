import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAdjustments } from "../../db/schema/inventory-adjustments.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
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
  const product = await findProductById(data.productId);

  if (!product) {
    throw new Error("Product not found");
  }

  if (product.status === "INACTIVE") {
    throw new Error("Product is inactive");
  }

  const location = await findLocationById(data.locationId);

  if (!location) {
    throw new Error("Location not found");
  }

  if (location.status === "INACTIVE") {
    throw new Error("Location is inactive");
  }

  const stock = await findStockByProductAndLocation(
    data.productId,
    data.locationId,
  );

  if (!stock) {
    throw new Error("Stock record not found");
  }

  const newQuantityOnHand = stock.quantityOnHand + data.quantityChange;

  if (newQuantityOnHand < 0) {
    throw new Error("Adjustment would result in negative stock");
  }

  if (stock.quantityAllocated > newQuantityOnHand) {
    throw new Error("Adjustment would reduce stock below allocated quantity");
  }

  return db.transaction(async (tx) => {
    const [updatedStock] = await tx
      .update(inventoryStock)
      .set({
        quantityOnHand: newQuantityOnHand,
        updatedAt: new Date(),
      })
      .where(eq(inventoryStock.id, stock.id))
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

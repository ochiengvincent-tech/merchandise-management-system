import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import {
  allocateStock,
  findStockByProductAndLocation,
  releaseStock
} from "./stock-repository.js";

export const allocateStockService = async (data: {
  productId: string;
  locationId: string;
  quantity: number;
  actorId: string;
  reference?: string;
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
    data.locationId
  );

  if (!stock) {
    throw new Error("Stock record not found");
  }

  const quantityAvailable =
    stock.quantityOnHand - stock.quantityAllocated;

  if (quantityAvailable < data.quantity) {
    throw new Error("Insufficient available stock");
  }

  return db.transaction(async (tx) => {
    const updatedStock = await allocateStock(
      stock.id,
      data.quantity,
      tx
    );

    if (!updatedStock) {
      throw new Error("Failed to allocate stock");
    }

    await tx.insert(inventoryAuditLogs).values({
      productId: data.productId,
      locationId: data.locationId,
      action: "STOCK_ALLOCATED",
      actorId: data.actorId,
      details: {
        previousQuantityAllocated: stock.quantityAllocated,
        newQuantityAllocated: updatedStock.quantityAllocated,
        quantity: data.quantity,
        reference: data.reference
      }
    });

    return {
      ...updatedStock,
      quantityAvailable:
        updatedStock.quantityOnHand -
        updatedStock.quantityAllocated
    };
  });
};

export const releaseStockService = async (data: {
  productId: string;
  locationId: string;
  quantity: number;
  actorId: string;
  reference?: string;
}) => {
  const product = await findProductById(data.productId);

  if (!product) {
    throw new Error("Product not found");
  }

  const location = await findLocationById(data.locationId);

  if (!location) {
    throw new Error("Location not found");
  }

  const stock = await findStockByProductAndLocation(
    data.productId,
    data.locationId
  );

  if (!stock) {
    throw new Error("Stock record not found");
  }

  if (stock.quantityAllocated < data.quantity) {
    throw new Error("Cannot release more than allocated stock");
  }

  return db.transaction(async (tx) => {
    const updatedStock = await releaseStock(
      stock.id,
      data.quantity,
      tx
    );

    if (!updatedStock) {
      throw new Error("Failed to release stock");
    }

    await tx.insert(inventoryAuditLogs).values({
      productId: data.productId,
      locationId: data.locationId,
      action: "STOCK_RELEASED",
      actorId: data.actorId,
      details: {
        previousQuantityAllocated: stock.quantityAllocated,
        newQuantityAllocated: updatedStock.quantityAllocated,
        quantity: data.quantity,
        reference: data.reference
      }
    });

    return {
      ...updatedStock,
      quantityAvailable:
        updatedStock.quantityOnHand -
        updatedStock.quantityAllocated
    };
  });
};
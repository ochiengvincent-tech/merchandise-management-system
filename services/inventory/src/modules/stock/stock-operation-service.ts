import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { createStockLowEvent } from "../events/stock-low-event-service.js";
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
  const [product, location] = await Promise.all([
    findProductById(data.productId),
    findLocationById(data.locationId)
  ]);

  const errors = [];

  if (!product) {
    errors.push({
      field: "productId",
      message: "Product not found"
    });
  } else if (product.status === "INACTIVE") {
    errors.push({
      field: "productId",
      message: "Product is inactive"
    });
  }

  if (!location) {
    errors.push({
      field: "locationId",
      message: "Location not found"
    });
  } else if (location.status === "INACTIVE") {
    errors.push({
      field: "locationId",
      message: "Location is inactive"
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
    data.locationId
  );

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record not found"
      }
    ]);
  }

  const quantityAvailable =
    stock.quantityOnHand - stock.quantityAllocated;

  if (quantityAvailable < data.quantity) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantity",
        message: "Insufficient available stock"
      }
    ]);
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

    const stockLowEvent = await createStockLowEvent(
      stock,
      updatedStock,
      product.reorderLevel,
      tx
    );

    return {
      stock: {
        ...updatedStock,
        quantityAvailable:
          updatedStock.quantityOnHand -
          updatedStock.quantityAllocated
      },
      stockLowEvent
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
  const [product, location] = await Promise.all([
    findProductById(data.productId),
    findLocationById(data.locationId)
  ]);

  const errors = [];

  if (!product) {
    errors.push({
      field: "productId",
      message: "Product not found"
    });
  } else if (product.status === "INACTIVE") {
    errors.push({
      field: "productId",
      message: "Product is inactive"
    });
  }

  if (!location) {
    errors.push({
      field: "locationId",
      message: "Location not found"
    });
  } else if (location.status === "INACTIVE") {
    errors.push({
      field: "locationId",
      message: "Location is inactive"
    });
  }

  if (errors.length > 0) {
    throw new AppError("Validation failed", 400, errors);
  }

  const stock = await findStockByProductAndLocation(
    data.productId,
    data.locationId
  );

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record not found"
      }
    ]);
  }

  if (stock.quantityAllocated < data.quantity) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantity",
        message: "Cannot release more than allocated stock"
      }
    ]);
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
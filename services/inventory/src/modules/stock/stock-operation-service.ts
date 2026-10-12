import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import { createStockLowEvent } from "../events/stock-low-event-service.js";
import {
  allocateStockTransaction,
  findStockByProductAndLocation,
  releaseStockTransaction,
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

  const quantityAvailable = stock.quantityOnHand - stock.quantityAllocated;

  if (quantityAvailable < data.quantity) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantity",
        message: "Insufficient available stock",
      },
    ]);
  }

  return allocateStockTransaction(stock, data, product.reorderLevel, createStockLowEvent);
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

  if (stock.quantityAllocated < data.quantity) {
    throw new AppError("Validation failed", 400, [
      {
        field: "quantity",
        message: "Cannot release more than allocated stock",
      },
    ]);
  }

  return releaseStockTransaction(stock, data);
};

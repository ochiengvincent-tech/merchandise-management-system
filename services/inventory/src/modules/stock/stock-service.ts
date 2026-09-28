import { AppError } from "../../errors/app-error.js";
import { findLocationById } from "../locations/location-repository.js";
import { findProductById } from "../products/product-repository.js";
import {
  createStock,
  findStockByLocation,
  findStockByProduct,
  findStockByProductAndLocation,
  findInventoryValuation,
  updateStock
} from "./stock-repository.js";

export const getStockByProductAndLocationService = async (
  productId: string,
  locationId: string
) => {
  const stock = await findStockByProductAndLocation(
    productId,
    locationId
  );

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record not found"
      }
    ]);
  }

  return {
    ...stock,
    quantityAvailable:
      stock.quantityOnHand - stock.quantityAllocated
  };
};

export const getStockByProductService = async (
  productId: string
) => {
  const stockRecords = await findStockByProduct(productId);

  return stockRecords.map((stock) => ({
    ...stock,
    quantityAvailable:
      stock.quantityOnHand - stock.quantityAllocated
  }));
};

export const getStockByLocationService = async (
  locationId: string
) => {
  const stockRecords = await findStockByLocation(locationId);

  return stockRecords.map((stock) => ({
    ...stock,
    quantityAvailable:
      stock.quantityOnHand - stock.quantityAllocated
  }));
};

export const createStockService = async (
  productId: string,
  locationId: string
) => {
  const [product, location] = await Promise.all([
    findProductById(productId),
    findLocationById(locationId)
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

  const existingStock = await findStockByProductAndLocation(
    productId,
    locationId
  );

  if (existingStock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record already exists"
      }
    ]);
  }

  return createStock({
    productId,
    locationId,
    quantityOnHand: 0,
    quantityAllocated: 0,
    quantityOnOrder: 0
  });
};

export const updateStockService = async (
  id: string,
  data: {
    quantityOnHand?: number;
    quantityAllocated?: number;
    quantityOnOrder?: number;
  }
) => {
  const stock = await updateStock(id, data);

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Stock record not found"
      }
    ]);
  }

  return {
    ...stock,
    quantityAvailable:
      stock.quantityOnHand - stock.quantityAllocated
  };
};
export const getInventoryValuationService = async () => {
  const records = await findInventoryValuation();
  const totalCents = records.reduce((total, record) => {
    const [whole = "0", fraction = ""] = record.extendedValue.split(".");
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
    return total + cents;
  }, 0n);
  const totalValue = `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, "0")}`;

  return { currency: "KES", totalValue, records };
};

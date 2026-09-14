import { findLocationById } from "../locations/location-repository.js";
import { findProductById } from "../products/product-repository.js";
import {
  createStock,
  findStockByLocation,
  findStockByProduct,
  findStockByProductAndLocation,
  updateStock,
} from "./stock-repository.js";

export const getStockByProductAndLocationService = async (
  productId: string,
  locationId: string,
) => {
  const stock = await findStockByProductAndLocation(productId, locationId);

  if (!stock) {
    throw new Error("Stock record not found");
  }

  return {
    ...stock,
    quantityAvailable: stock.quantityOnHand - stock.quantityAllocated,
  };
};

export const getStockByProductService = async (productId: string) => {
  const stockRecords = await findStockByProduct(productId);

  return stockRecords.map((stock) => ({
    ...stock,
    quantityAvailable: stock.quantityOnHand - stock.quantityAllocated,
  }));
};

export const getStockByLocationService = async (locationId: string) => {
  const stockRecords = await findStockByLocation(locationId);

  return stockRecords.map((stock) => ({
    ...stock,
    quantityAvailable: stock.quantityOnHand - stock.quantityAllocated,
  }));
};

export const createStockService = async (
  productId: string,
  locationId: string,
) => {
  const product = await findProductById(productId);

  if (!product) {
    throw new Error("Product not found");
  }

  if (product.status === "INACTIVE") {
    throw new Error("Product is inactive");
  }

  const location = await findLocationById(locationId);

  if (!location) {
    throw new Error("Location not found");
  }

  if (location.status === "INACTIVE") {
    throw new Error("Location is inactive");
  }

  const existingStock = await findStockByProductAndLocation(
    productId,
    locationId,
  );

  if (existingStock) {
    throw new Error("Stock record already exists");
  }

  return createStock({
    productId,
    locationId,
    quantityOnHand: 0,
    quantityAllocated: 0,
    quantityOnOrder: 0,
  });
};

export const updateStockService = async (
  id: string,
  data: {
    quantityOnHand?: number;
    quantityAllocated?: number;
    quantityOnOrder?: number;
  },
) => {
  const stock = await updateStock(id, data);

  if (!stock) {
    throw new Error("Stock record not found");
  }

  return {
    ...stock,
    quantityAvailable: stock.quantityOnHand - stock.quantityAllocated,
  };
};

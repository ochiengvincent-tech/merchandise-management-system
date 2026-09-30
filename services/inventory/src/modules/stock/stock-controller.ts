import type { Request, Response, NextFunction } from "express";
import {
  createStockService,
  getStockByLocationService,
  getStockByProductAndLocationService,
  getStockByProductService,
  getInventoryValuationService
} from "./stock-service.js";
import {
  stockByLocationSchema,
  stockByProductAndLocationSchema,
  stockByProductSchema
} from "./stock-schema.js";
import { warehouseAdjustmentSchema } from "../adjustments/adjustment-schema.js";
import { createWarehouseAdjustmentService } from "../adjustments/warehouse-adjustment-service.js";

export const getStockByProductAndLocationController = async (
  req: Request,
  res: Response
) => {
  const { productId, locationId } =
    stockByProductAndLocationSchema.parse(req.query);

  const stock = await getStockByProductAndLocationService(
    productId,
    locationId
  );

  return res.status(200).json(stock);
};

export const getStockByProductController = async (
  req: Request,
  res: Response
) => {
  const { productId } = stockByProductSchema.parse(req.query);

  const stock = await getStockByProductService(productId);

  return res.status(200).json(stock);
};

export const getStockByLocationController = async (
  req: Request,
  res: Response
) => {
  const { locationId } = stockByLocationSchema.parse(req.query);

  const stock = await getStockByLocationService(locationId);

  return res.status(200).json(stock);
};
export const createStockController = async (
  req: Request,
  res: Response
) => {
  const { productId, locationId } =
    stockByProductAndLocationSchema.parse(req.body);

  const stock = await createStockService(
    productId,
    locationId
  );

  return res.status(201).json(stock);
};
export const getInventoryValuationController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json(await getInventoryValuationService());
  } catch (error) {
    next(error);
  }
};

export const createWarehouseAdjustmentController = async (
  req: Request,
  res: Response,
) => {
  const data = warehouseAdjustmentSchema.parse(req.body);
  const result = await createWarehouseAdjustmentService(data);
  return res.status(result.duplicate ? 200 : 201).json(result);
};

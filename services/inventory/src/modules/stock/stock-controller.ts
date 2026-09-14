import type { Request, Response } from "express";
import {
    createStockService,
  getStockByLocationService,
  getStockByProductAndLocationService,
  getStockByProductService
} from "./stock-service.js";
import {
  stockByLocationSchema,
  stockByProductAndLocationSchema,
  stockByProductSchema
} from "./stock-schema.js";

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
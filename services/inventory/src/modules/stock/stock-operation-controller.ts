import type { Request, Response } from "express";
import {
  allocateStockService,
  releaseStockService
} from "./stock-operation-service.js";
import {
  allocateStockSchema,
  releaseStockSchema
} from "./stock-operation-schema.js";

export const allocateStockController = async (
  req: Request,
  res: Response
) => {
  const data = allocateStockSchema.parse(req.body);

  const stock = await allocateStockService(data);

  return res.status(200).json(stock);
};

export const releaseStockController = async (
  req: Request,
  res: Response
) => {
  const data = releaseStockSchema.parse(req.body);

  const stock = await releaseStockService(data);

  return res.status(200).json(stock);
};
import type { Request, Response } from "express";
import { createAdjustmentService } from "./adjustment-service.js";
import { createAdjustmentSchema } from "./adjustment-schema.js";

export const createAdjustmentController = async (
  req: Request,
  res: Response
) => {
  const data = createAdjustmentSchema.parse(req.body);

  const result = await createAdjustmentService(data);

  return res.status(201).json(result);
};
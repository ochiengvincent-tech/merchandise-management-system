import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import {
  getOpenPurchaseOrders,
  getReceivingPurchaseOrder,
} from "./receipt-service.js";

const idSchema = z.uuid();
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export async function listOpenPurchaseOrdersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = querySchema.parse(req.query);
    const result = await getOpenPurchaseOrders(query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getReceivingPurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      throw new AppError("Invalid purchase order ID", 400, [
        { field: "id", message: "Provide a valid UUID." },
      ]);
    }
    const purchaseOrder = await getReceivingPurchaseOrder(id.data);
    return res.status(200).json({ data: purchaseOrder });
  } catch (error) {
    return next(error);
  }
}

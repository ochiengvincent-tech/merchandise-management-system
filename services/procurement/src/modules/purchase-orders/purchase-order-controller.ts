import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { createPurchaseOrder } from "./purchase-order-service.js";

export async function createPurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const purchaseOrder = await createPurchaseOrder(req.body);

    return res.status(201).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}
import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { z } from "zod";

import { cancelPurchaseOrder } from "./purchase-order-cancellation-service.js";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const actorIdSchema = z.string().uuid();

export async function cancelPurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const params = paramsSchema.safeParse(req.params);

    if (!params.success) {
      return res.status(400).json({
        error: {
          message: "Invalid purchase order ID",
        },
      });
    }

    const actorId = req.header("x-actor-id");

    const actorIdResult = actorIdSchema.safeParse(actorId);

    if (!actorIdResult.success) {
      return res.status(400).json({
        error: {
          message: "Invalid actor ID",
        },
      });
    }

    const purchaseOrder = await cancelPurchaseOrder(
      params.data.id,
      actorIdResult.data,
    );

    return res.status(200).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}
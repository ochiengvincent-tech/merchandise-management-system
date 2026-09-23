import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { z } from "zod";

import { getPurchaseOrder } from "./purchase-order-service.js";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function getPurchaseOrderController(
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

    const purchaseOrder = await getPurchaseOrder(
      params.data.id,
    );

    return res.status(200).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}
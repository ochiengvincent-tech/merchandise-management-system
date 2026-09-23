import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { updatePurchaseOrder } from "./purchase-order-update-service.js";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z
  .object({
    actorId: z.string().uuid(),
    notes: z.string().optional(),
    destinationLocationId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.notes !== undefined || data.destinationLocationId !== undefined,
    {
      message: "At least one update field is required",
    },
  );

export async function updatePurchaseOrderController(
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

    const body = bodySchema.safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({
        error: {
          message: "Invalid purchase order data",
        },
      });
    }

    const purchaseOrder = await updatePurchaseOrder(
      params.data.id,
      {
        notes: body.data.notes,
        destinationLocationId: body.data.destinationLocationId,
      },
      body.data.actorId,
    );

    if (!purchaseOrder) {
      return res.status(404).json({
        error: {
          message: "Purchase order not found",
        },
      });
    }

    return res.status(200).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}

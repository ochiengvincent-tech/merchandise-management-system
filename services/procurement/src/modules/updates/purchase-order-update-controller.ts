import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { updatePurchaseOrder } from "./purchase-order-update-service.js";

const paramsSchema = z.object({
  id: z.uuid(),
});

const bodySchema = z
  .object({
    actorId: z.uuid(),
    poNumber: z.string().trim().min(1).max(50).optional(),
    vendorId: z.uuid().optional(),
    destinationLocationId: z.uuid().optional(),
    requestedDeliveryDate: z.iso.date().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    lines: z
      .array(
        z.object({
          productId: z.uuid(),
          quantityOrdered: z.number().int().positive(),
        }),
      )
      .min(1)
      .optional(),
  })
  .refine(
    (data) =>
      data.poNumber !== undefined ||
      data.vendorId !== undefined ||
      data.destinationLocationId !== undefined ||
      data.requestedDeliveryDate !== undefined ||
      data.notes !== undefined ||
      data.lines !== undefined,
    {
      message: "At least one purchase-order field must be provided.",
    },
  );

export async function updatePurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = paramsSchema.parse(req.params);
    const { actorId, ...data } = bodySchema.parse(req.body);
    const purchaseOrder = await updatePurchaseOrder(id, data, actorId);

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

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { createPurchaseOrder } from "./purchase-order-service.js";

const bodySchema = z.object({
  poNumber: z.string().trim().min(1),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  requestedDeliveryDate: z.iso.date().nullable().optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantityOrdered: z.number().int().positive(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
  createdBy: z.uuid(),
});

export async function createPurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = bodySchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          details: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    const purchaseOrder = await createPurchaseOrder(result.data);

    return res.status(201).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  approvePurchaseOrder,
  rejectPurchaseOrder,
} from "./approval-service.js";

export async function approvePurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      approverId: z.string().uuid(),
    });

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
          message: "Invalid approver ID",
        },
      });
    }

    const { id } = params.data;
    const { approverId } = body.data;

    const purchaseOrder = await approvePurchaseOrder(id, approverId);

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

export async function rejectPurchaseOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const bodySchema = z.object({
      approverId: z.string().uuid(),
    });

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
          message: "Invalid approver ID",
        },
      });
    }

    const { id } = params.data;
    const { approverId } = body.data;
    const { comments } = req.body;

    const purchaseOrder = await rejectPurchaseOrder(id, approverId, comments);

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

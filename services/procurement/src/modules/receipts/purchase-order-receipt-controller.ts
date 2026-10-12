import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { z } from "zod";

import { receivePurchaseOrder } from "./purchase-order-receipt-service.js";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const receiptItemSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  quantityReceived: z.number().positive(),
});

const bodySchema = z.object({
  receivingReceiptId: z.string().uuid().optional(),
  items: z.array(receiptItemSchema).min(1),
});

const actorIdSchema = z.string().uuid();

export async function receivePurchaseOrderController(
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
          message: "Invalid receipt data",
        },
      });
    }

    const actorId = req.header("x-actor-id");

    const actorIdResult =
      actorIdSchema.safeParse(actorId);

    if (!actorIdResult.success) {
      return res.status(400).json({
        error: {
          message: "Invalid actor ID",
        },
      });
    }

    const result = await receivePurchaseOrder(
      params.data.id,
      body.data.items,
      actorIdResult.data,
      body.data.receivingReceiptId,
    );

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export function receivePurchaseOrderFromReceivingController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (typeof req.body?.receivingReceiptId !== "string") {
    return res.status(400).json({
      error: { message: "A Receiving receipt ID is required" },
    });
  }

  return receivePurchaseOrderController(req, res, next);
}

export function rejectDirectPurchaseOrderReceiptController(
  _req: Request,
  res: Response,
) {
  return res.status(409).json({
    error: {
      message:
        "Direct purchase-order receipt is disabled while Receiving is enabled. Record deliveries through the Receiving service.",
    },
  });
}

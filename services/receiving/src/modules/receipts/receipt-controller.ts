import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import {
  getGoodsReceipt,
  recordGoodsReceipt,
  searchGoodsReceipts,
} from "./receipt-service.js";

const idSchema = z.uuid();
const receiptLineSchema = z.object({
  purchaseOrderLineId: z.uuid().optional(),
  productId: z.uuid(),
  productCode: z.string().trim().min(1).max(100),
  quantityObserved: z.number().int().nonnegative(),
  quantityDamaged: z.number().int().nonnegative().default(0),
  notes: z.string().trim().max(2000).optional(),
});
const createReceiptSchema = z.object({
  purchaseOrderId: z.uuid(),
  supplierDeliveryNote: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(4000).optional(),
  lines: z.array(receiptLineSchema).min(1),
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  purchaseOrderId: z.uuid().optional(),
  search: z.string().trim().max(100).optional(),
  discrepancy: z.enum(["SHORTAGE", "OVERAGE", "DAMAGE"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function publicReceipt<T extends {
  requestHash: string;
  lines: Array<{ quantityObserved: number; quantityAccepted: number }>;
}>(receipt: T) {
  const { requestHash: _requestHash, ...data } = receipt;
  return {
    ...data,
    lines: data.lines.map((line) => ({
      ...line,
      quantityRejected: line.quantityObserved - line.quantityAccepted,
    })),
  };
}

export async function createReceiptController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor = idSchema.safeParse(req.header("x-actor-id"));
    if (!actor.success) {
      throw new AppError("A valid receiving actor ID is required", 400, [
        { field: "x-actor-id", message: "Provide a valid UUID." },
      ]);
    }
    const idempotencyKey = idSchema.safeParse(req.header("idempotency-key"));
    if (!idempotencyKey.success) {
      throw new AppError("An idempotency key is required", 400, [
        {
          field: "Idempotency-Key",
          message: "Provide a UUID and reuse it if the request needs to be retried.",
        },
      ]);
    }
    const body = createReceiptSchema.parse(req.body);
    const receipt = await recordGoodsReceipt(
      { ...body, receivedBy: actor.data },
      idempotencyKey.data,
    );
    return res.status(201).json({ data: publicReceipt(receipt) });
  } catch (error) {
    return next(error);
  }
}

export async function listReceiptsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = listQuerySchema.parse(req.query);
    if (query.from && query.to && query.from > query.to) {
      throw new AppError("Invalid receipt date range", 400, [
        { field: "to", message: "Choose a date on or after the From date." },
      ]);
    }
    const result = await searchGoodsReceipts(query);
    return res.status(200).json({
      data: result.data.map(publicReceipt),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getReceiptController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      throw new AppError("Invalid goods receipt ID", 400, [
        { field: "id", message: "Provide a valid UUID." },
      ]);
    }
    const receipt = await getGoodsReceipt(id.data);
    return res.status(200).json({ data: publicReceipt(receipt) });
  } catch (error) {
    return next(error);
  }
}

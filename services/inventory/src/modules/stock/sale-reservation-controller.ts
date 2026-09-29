import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { releaseSaleStock, reserveSaleStock } from "./sale-reservation-service.js";

const reservationSchema = z.object({
  reservationId: z.uuid(), saleId: z.uuid(), productId: z.uuid(), locationId: z.uuid(),
  quantity: z.number().int().positive(), actorId: z.uuid(),
});

export async function reserveSaleStockController(req: Request, res: Response) {
  const key = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!key.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this reservation." }]);
  const input = reservationSchema.parse(req.body);
  const result = await reserveSaleStock({ ...input, idempotencyKey: key.data });
  return res.status(result.duplicate ? 200 : 201).json({ data: result.reservation });
}

export async function releaseSaleStockController(req: Request, res: Response) {
  const reservationId = z.uuid().parse(req.params.id);
  const { actorId } = z.object({ actorId: z.uuid() }).parse(req.body);
  const result = await releaseSaleStock(reservationId, actorId);
  return res.status(200).json({ data: result.reservation });
}

import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { transferStock } from "./transfer-service.js";

export const postMovementsController: RequestHandler = async (req, res) => {
  const key = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!key.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this bin transfer." }]);
  const data = z.object({
    locationId: z.uuid(), productId: z.uuid(), sourceBinId: z.uuid(), destinationBinId: z.uuid(),
    quantity: z.number().int().positive(), disposition: z.enum(["SELLABLE", "QUARANTINED", "DISCREPANCY"]),
    actorId: z.uuid(), reason: z.string().trim().max(255).optional(),
  }).parse(req.body);
  const result = await transferStock({ ...data, idempotencyKey: key.data });
  return res.status(result.duplicate ? 200 : 201).json({ data: result });
};

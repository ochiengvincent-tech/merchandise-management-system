import { Router } from "express";
import { z } from "zod";
import { submitWarehouseAdjustment, getWarehouseAdjustment } from "./adjustment-service.js";
import { AppError } from "../../errors/app-error.js";

const router: Router = Router();

router.post("/locations/:locationId/adjustments", async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const idempotencyKey = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success) {
    throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this adjustment." }]);
  }
  const data = z.object({
    productId: z.uuid(),
    sourceBinId: z.uuid(),
    quantityChange: z.number().int().refine((value) => value !== 0, { message: "Quantity change cannot be zero" }),
    reason: z.string().trim().min(1).max(255),
    actorId: z.uuid(),
  }).parse(req.body);
  const result = await submitWarehouseAdjustment({ ...data, locationId, idempotencyKey: idempotencyKey.data });
  return res.status(result.status === "SYNCED" ? 200 : 202).json(result);
});

router.get("/adjustments/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const adjustment = await getWarehouseAdjustment(id);
  return res.status(200).json({ data: adjustment });
});

export { router as adjustmentRouter };

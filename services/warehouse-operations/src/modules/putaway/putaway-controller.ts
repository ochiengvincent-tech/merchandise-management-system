import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getPutawayTask, listPutawayTasks, recordPutaway } from "./putaway-service.js";

export const getPutawayTasksController: RequestHandler = async (req, res) => {
  const filters = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional(), locationId: z.uuid().optional() }).parse(req.query);
  return res.status(200).json({ data: await listPutawayTasks(filters) });
};

export const getPutawayTasksTaskIdController: RequestHandler = async (req, res) => {
  const taskId = z.uuid().parse(req.params.taskId);
  return res.status(200).json({ data: await getPutawayTask(taskId) });
};

export const postPutawayTasksTaskIdLinesLineIdPutawayController: RequestHandler = async (req, res) => {
  const taskId = z.uuid().parse(req.params.taskId);
  const lineId = z.uuid().parse(req.params.lineId);
  const key = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!key.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this putaway movement." }]);
  const body = z.object({ destinationBinId: z.uuid(), quantity: z.number().int().positive(), actorId: z.uuid() }).parse(req.body);
  const result = await recordPutaway({ taskId, lineId, idempotencyKey: key.data, ...body });
  return res.status(result.duplicate ? 200 : 201).json({ data: result });
};

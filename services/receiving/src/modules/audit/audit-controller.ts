import type { RequestHandler, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { listReceivingAudit } from "./audit-service.js";
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const getRootController: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = querySchema.parse(req.query);
    if (query.from && query.to && query.from > query.to) {
      throw new AppError("Invalid audit date range", 400, [
        { field: "to", message: "Choose a date on or after the From date." },
      ]);
    }
    return res.status(200).json(await listReceivingAudit(query));
  } catch (error) {
    return next(error);
  }
};

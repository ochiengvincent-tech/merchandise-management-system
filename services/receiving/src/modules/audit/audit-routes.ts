import { Router, type Router as ExpressRouter } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { listReceivingAuditLogs } from "../receipts/receipt-repository.js";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const auditRouter: ExpressRouter = Router();

auditRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = querySchema.parse(req.query);
    if (query.from && query.to && query.from > query.to) {
      throw new AppError("Invalid audit date range", 400, [
        { field: "to", message: "Choose a date on or after the From date." },
      ]);
    }
    const offset = (query.page - 1) * query.limit;
    const result = await listReceivingAuditLogs(query.limit, offset, query);
    return res.status(200).json({
      data: result.data,
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
});

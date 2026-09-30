import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import { listInventoryAuditLogs } from "./audit-repository.js";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).refine((query) => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), {
  message: "From date must be before or equal to the to date",
  path: ["from"],
});

export async function listInventoryAuditLogsController(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("Invalid audit query", 400, parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  const { from, to, ...filters } = parsed.data;
  const result = await listInventoryAuditLogs({
    ...filters,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  return res.status(200).json(result);
}

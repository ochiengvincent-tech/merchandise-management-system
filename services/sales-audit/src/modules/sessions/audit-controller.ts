import type { RequestHandler } from "express";
import { z } from "zod";
import { listSalesAuditLogs } from "./audit-service.js";

export const getAuditLogsController: RequestHandler = async (req, res) => {
  const filters = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), action: z.string().trim().max(100).optional(), actorId: z.uuid().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  return res.json(await listSalesAuditLogs(filters));
};

import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { warehouseAuditLogs } from "../../db/schema/warehouse.js";

export const auditRouter: Router = Router();

auditRouter.get("/audit-logs", async (req, res) => {
  const filters = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().trim().max(100).optional(),
    actorId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }).parse(req.query);
  const conditions = [];
  if (filters.action) conditions.push(eq(warehouseAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(warehouseAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(warehouseAuditLogs.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(warehouseAuditLogs.createdAt, new Date(filters.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db.select().from(warehouseAuditLogs).where(where)
      .orderBy(desc(warehouseAuditLogs.createdAt), desc(warehouseAuditLogs.id))
      .limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(warehouseAuditLogs).where(where),
  ]);
  const total = Number(row?.total ?? 0);
  return res.json({
    data,
    pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
  });
});

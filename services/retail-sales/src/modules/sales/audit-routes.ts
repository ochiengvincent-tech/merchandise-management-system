import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { retailAuditLogs } from "../../db/schema/index.js";
const router: Router = Router();
router.get("/", async (req, res) => {
  const filters = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20), action: z.string().trim().max(100).optional(), actorId: z.uuid().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  const conditions = [];
  if (filters.action) conditions.push(eq(retailAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(retailAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(retailAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(retailAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [countRow]] = await Promise.all([
    db.select().from(retailAuditLogs).where(where).orderBy(desc(retailAuditLogs.createdAt), desc(retailAuditLogs.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(retailAuditLogs).where(where),
  ]);
  const total = Number(countRow?.total ?? 0);
  return res.json({ data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } });
});
export { router as retailAuditRouter };

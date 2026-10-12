import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { salesAuditLogs } from "../../db/schema/sales-audit.js";

export async function findSalesAuditLogs(filters: { page: number; limit: number; action?: string; actorId?: string; from?: Date; to?: Date }) {
  const conditions = [];
  if (filters.action) conditions.push(eq(salesAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(salesAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(salesAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(salesAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db.select().from(salesAuditLogs).where(where).orderBy(desc(salesAuditLogs.createdAt), desc(salesAuditLogs.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(salesAuditLogs).where(where),
  ]);
  return { data, total: Number(row?.total ?? 0) };
}

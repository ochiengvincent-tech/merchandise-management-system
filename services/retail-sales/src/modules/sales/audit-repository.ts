import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { retailAuditLogs } from "../../db/schema/index.js";

export async function findRetailAuditLogs(filters: { page: number; limit: number; action?: string; actorId?: string; from?: Date; to?: Date }) {
  const conditions = [];
  if (filters.action) conditions.push(eq(retailAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(retailAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(retailAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(retailAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db.select().from(retailAuditLogs).where(where).orderBy(desc(retailAuditLogs.createdAt), desc(retailAuditLogs.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(retailAuditLogs).where(where),
  ]);
  return { data, total: Number(row?.total ?? 0) };
}

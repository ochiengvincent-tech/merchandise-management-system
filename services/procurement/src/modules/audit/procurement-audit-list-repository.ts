import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { procurementAuditLogs } from "../../db/schema/procurement-audit-logs.js";

export type AuditLogFilters = {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
};

export async function listProcurementAuditLogs(filters: AuditLogFilters) {
  const conditions = [];
  if (filters.action) conditions.push(eq(procurementAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(procurementAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(procurementAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(procurementAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db.select().from(procurementAuditLogs).where(where)
      .orderBy(desc(procurementAuditLogs.createdAt), desc(procurementAuditLogs.id))
      .limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(procurementAuditLogs).where(where),
  ]);
  const total = Number(totalRow?.total ?? 0);
  return { data: rows, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
}

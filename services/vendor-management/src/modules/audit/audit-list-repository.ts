import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vendorAuditLogs } from "../../db/schema/vendor-audit-logs.js";

export type AuditLogFilters = {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
};

export async function listVendorAuditLogs(filters: AuditLogFilters) {
  const conditions = [];
  if (filters.action) conditions.push(eq(vendorAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(vendorAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(vendorAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(vendorAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: vendorAuditLogs.id,
      vendorId: vendorAuditLogs.vendorId,
      vendorProductId: vendorAuditLogs.vendorProductId,
      action: vendorAuditLogs.action,
      actorId: vendorAuditLogs.actorId,
      beforeState: vendorAuditLogs.beforeState,
      afterState: vendorAuditLogs.afterState,
      signature: vendorAuditLogs.signature,
      createdAt: vendorAuditLogs.createdAt,
    }).from(vendorAuditLogs).where(where)
      .orderBy(desc(vendorAuditLogs.createdAt), desc(vendorAuditLogs.id))
      .limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(vendorAuditLogs).where(where),
  ]);
  const total = Number(totalRow?.total ?? 0);
  return { data: rows, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
}

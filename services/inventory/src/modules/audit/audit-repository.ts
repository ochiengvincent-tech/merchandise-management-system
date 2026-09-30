import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";

export type AuditLogFilters = {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
};

export async function listInventoryAuditLogs(filters: AuditLogFilters) {
  const conditions = [];
  if (filters.action) conditions.push(eq(inventoryAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(inventoryAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(inventoryAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(inventoryAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db.select().from(inventoryAuditLogs).where(where)
      .orderBy(desc(inventoryAuditLogs.createdAt), desc(inventoryAuditLogs.id))
      .limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(inventoryAuditLogs).where(where),
  ]);
  const total = Number(totalRow?.total ?? 0);
  return { data: rows, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
}

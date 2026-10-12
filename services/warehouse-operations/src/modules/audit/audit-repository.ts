import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs } from "../../db/schema/warehouse.js";

export async function findWarehouseAuditLogs(filters: { page: number; limit: number; action?: string; actorId?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.action) conditions.push(eq(warehouseAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(warehouseAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(warehouseAuditLogs.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(warehouseAuditLogs.createdAt, new Date(filters.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db.select().from(warehouseAuditLogs).where(where).orderBy(desc(warehouseAuditLogs.createdAt), desc(warehouseAuditLogs.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(warehouseAuditLogs).where(where),
  ]);
  return { data, total: Number(row?.total ?? 0) };
}

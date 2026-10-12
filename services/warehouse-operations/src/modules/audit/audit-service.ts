import { findWarehouseAuditLogs } from "./audit-repository.js";

export async function listWarehouseAuditLogs(filters: { page: number; limit: number; action?: string; actorId?: string; from?: string; to?: string }) {
  const result = await findWarehouseAuditLogs(filters);
  return { data: result.data, pagination: { page: filters.page, limit: filters.limit, total: result.total, totalPages: Math.ceil(result.total / filters.limit) } };
}

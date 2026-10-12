import { findSalesAuditLogs } from "./audit-repository.js";

export async function listSalesAuditLogs(filters: { page: number; limit: number; action?: string; actorId?: string; from?: Date; to?: Date }) {
  const result = await findSalesAuditLogs(filters);
  return { data: result.data, pagination: { page: filters.page, limit: filters.limit, total: result.total, totalPages: Math.ceil(result.total / filters.limit) } };
}

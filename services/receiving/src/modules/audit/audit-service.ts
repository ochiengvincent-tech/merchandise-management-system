import { listReceivingAuditLogs } from "../receipts/receipt-repository.js";

export async function listReceivingAudit(filters: { page: number; limit: number; action?: string; actorId?: string; from?: Date; to?: Date }) {
  const result = await listReceivingAuditLogs(filters.limit, (filters.page - 1) * filters.limit, filters);
  return {
    data: result.data,
    pagination: { page: filters.page, limit: filters.limit, total: result.total, totalPages: Math.ceil(result.total / filters.limit) },
  };
}

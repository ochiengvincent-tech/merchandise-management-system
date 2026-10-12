import {
  createInventoryAuditLog,
  listInventoryAuditLogs,
  type AuditDatabase,
  type AuditLogFilters,
} from "./audit-repository.js";

export const createInventoryAuditLogService = (
  data: Parameters<typeof createInventoryAuditLog>[0],
  database?: AuditDatabase,
) => createInventoryAuditLog(data, database);
export const listInventoryAuditLogsService = (filters: AuditLogFilters) =>
  listInventoryAuditLogs(filters);

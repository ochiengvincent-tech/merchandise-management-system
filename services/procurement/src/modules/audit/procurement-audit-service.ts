import { db } from "../../db/index.js";
import { procurementAuditLogs } from "../../db/schema/procurement-audit-logs.js";

import { createProcurementAuditLog } from "./procurement-audit-repository.js";

export async function createProcurementAuditLogService<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof procurementAuditLogs.$inferInsert,
  database: T,
) {
  return createProcurementAuditLog(data, database);
}
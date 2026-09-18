import { db } from "../../db/index.js";
import { procurementAuditLogs } from "../../db/schema/procurement-audit-logs.js";

export async function createApprovalAuditLogWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof procurementAuditLogs.$inferInsert,
  database: T,
) {
  const [auditLog] = await database
    .insert(procurementAuditLogs)
    .values(data)
    .returning();

  return auditLog ?? null;
}
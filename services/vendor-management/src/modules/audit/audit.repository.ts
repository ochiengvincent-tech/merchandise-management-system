import { db } from "../../db/index.js";
import { vendorAuditLogs } from "../../db/schema/vendor-audit-logs.js";

type Database = typeof db;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createVendorAuditLog(
  data: typeof vendorAuditLogs.$inferInsert,
  database: Database | Transaction = db,
) {
  const [auditLog] = await database
    .insert(vendorAuditLogs)
    .values(data)
    .returning();

  return auditLog;
}

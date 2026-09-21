import { db } from "../../db/index.js";
import { createAuditSignature } from "./audit-signature.js";
import { createVendorAuditLog } from "./audit.repository.js";

type Database = typeof db;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createAuditLogService(
  data: {
    vendorId?: string | undefined;
    vendorProductId?: string | undefined;
    action: string;
    actorId: string;
    beforeState?: unknown;
    afterState?: unknown;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
  },
  database: Database | Transaction = db,
) {
  const createdAt = new Date();

  const signature = createAuditSignature({
    ...data,
    createdAt,
  });

  return createVendorAuditLog(
    {
      ...data,
      signature,
      createdAt,
    },
    database,
  );
}

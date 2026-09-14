import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";

export const createProductAuditLog = async (data: {
  productId: string;
  action:
    | "PRODUCT_CREATED"
    | "PRODUCT_UPDATED"
    | "PRODUCT_DEACTIVATED"
    | "PRODUCT_REACTIVATED";
  actorId?: string;
  details?: Record<string, unknown>;
}) => {
  const [auditLog] = await db
    .insert(inventoryAuditLogs)
    .values({
      productId: data.productId,
      action: data.action,
      actorId: data.actorId,
      details: data.details
    })
    .returning();

  return auditLog;
};
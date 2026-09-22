import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";

export const createLocationAuditLog = async (data: {
  locationId: string;
  action:
    | "LOCATION_UPDATED"
    | "LOCATION_DEACTIVATED"
    | "LOCATION_REACTIVATED";
  actorId?: string;
  details?: Record<string, unknown>;
}) => {
  const [auditLog] = await db
    .insert(inventoryAuditLogs)
    .values({
      locationId: data.locationId,
      action: data.action,
      actorId: data.actorId,
      details: data.details
    })
    .returning();

  return auditLog;
};
import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { purchaseOrders } from "./purchase-orders.js";

export const procurementAuditLogs = pgTable(
  "procurement_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id").references(
      () => purchaseOrders.id,
    ),

    action: varchar("action", {
      length: 50,
    }).notNull(),

    actorId: uuid("actor_id"),

    beforeState: jsonb("before_state"),

    afterState: jsonb("after_state"),

    details: jsonb("details"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
);
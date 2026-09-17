import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  inet,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { vendors } from "./vendors.js";
import { vendorProducts } from "./vendor-products.js";

export const vendorAuditLogs = pgTable("vendor_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  vendorId: uuid("vendor_id").references(() => vendors.id),

  vendorProductId: uuid("vendor_product_id").references(
    () => vendorProducts.id
  ),

  action: varchar("action", {
    length: 50
  }).notNull(),

  actorId: uuid("actor_id").notNull(),

  beforeState: jsonb("before_state"),

  afterState: jsonb("after_state"),

  ipAddress: inet("ip_address"),

  userAgent: text("user_agent"),

  signature: text("signature").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true
  }).notNull().defaultNow()
});
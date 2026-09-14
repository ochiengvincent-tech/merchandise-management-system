import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp
} from "drizzle-orm/pg-core";
import { products } from "./products.js";
import { inventoryLocations } from "./inventory-locations.js";

export const inventoryAuditLogs = pgTable("inventory_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").references(() => products.id),
  locationId: uuid("location_id").references(() => inventoryLocations.id),
  action: varchar("action", { length: 50 }).notNull(),
  actorId: uuid("actor_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", {
    withTimezone: true
  }).notNull().defaultNow()
});
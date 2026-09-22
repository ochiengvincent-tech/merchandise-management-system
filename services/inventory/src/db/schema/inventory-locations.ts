import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationCode: varchar("location_code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    locationType: varchar("location_type", { length: 30 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", {
      withTimezone: true
    }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true
    }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("inventory_locations_code_unique").on(table.locationCode),
    check(
      "inventory_locations_type_check",
      sql`${table.locationType} IN ('WAREHOUSE', 'STORE')`
    ),
    check(
      "inventory_locations_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    )
  ]
);
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: varchar("sku", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }).notNull(),
    unitOfMeasure: varchar("unit_of_measure", { length: 30 }).notNull(),
    barcode: varchar("barcode", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    reorderLevel: integer("reorder_level").notNull().default(0),
    createdAt: timestamp("created_at", {
      withTimezone: true
    }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true
    }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("products_sku_unique").on(table.sku),
    uniqueIndex("products_barcode_unique").on(table.barcode),
    check(
      "products_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    ),
    check(
      "products_reorder_level_check",
      sql`${table.reorderLevel} >= 0`
    )
  ]
);
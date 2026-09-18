import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  check,
  unique
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vendors } from "./vendors.js";

export const vendorProducts = pgTable(
  "vendor_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),

    productId: uuid("product_id").notNull(),

    supplierProductCode: varchar("supplier_product_code", {
      length: 100
    }),

    currentPrice: numeric("current_price", {
      precision: 12,
      scale: 2
    }).notNull(),

    leadTimeDays: integer("lead_time_days").notNull(),

    status: varchar("status", {
      length: 20
    })
      .notNull()
      .default("ACTIVE"),

    createdAt: timestamp("created_at", {
      withTimezone: true
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("vendor_products_vendor_product_unique").on(
      table.vendorId,
      table.productId
    ),

    check(
      "vendor_products_price_check",
      sql`${table.currentPrice} >= 0`
    ),

    check(
      "vendor_products_lead_time_check",
      sql`${table.leadTimeDays} >= 0`
    ),

    check(
      "vendor_products_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    )
  ]
);
import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  check,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products } from "./products.js";
import { inventoryLocations } from "./inventory-locations.js";

export const inventoryAdjustments = pgTable(
  "inventory_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id),
    quantityChange: integer("quantity_change").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 100 }),
    createdBy: uuid("created_by").notNull(),
    idempotencyKey: uuid("idempotency_key"),
    warehouseCommandId: uuid("warehouse_command_id"),
    sourceBinId: uuid("source_bin_id"),
    createdAt: timestamp("created_at", {
      withTimezone: true
    }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("inventory_adjustments_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("inventory_adjustments_warehouse_command_unique").on(table.warehouseCommandId),
    check(
      "inventory_adjustments_quantity_change_check",
      sql`${table.quantityChange} <> 0`
    )
  ]
);
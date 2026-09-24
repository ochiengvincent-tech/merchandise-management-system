import {
  pgTable,
  uuid,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products } from "./products.js";
import { inventoryLocations } from "./inventory-locations.js";

export const inventoryStock = pgTable(
  "inventory_stock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    quantityAllocated: integer("quantity_allocated").notNull().default(0),
    quantityOnOrder: integer("quantity_on_order").notNull().default(0),
    unitCost: numeric("unit_cost", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_stock_product_location_unique").on(
      table.productId,
      table.locationId,
    ),
    check("inventory_stock_on_hand_check", sql`${table.quantityOnHand} >= 0`),
    check(
      "inventory_stock_allocated_check",
      sql`${table.quantityAllocated} >= 0`,
    ),
    check("inventory_stock_on_order_check", sql`${table.quantityOnOrder} >= 0`),
    check("inventory_stock_unit_cost_check", sql`${table.unitCost} >= 0`),
    check(
      "inventory_stock_allocated_limit_check",
      sql`${table.quantityAllocated} <= ${table.quantityOnHand}`,
    ),
  ],
);

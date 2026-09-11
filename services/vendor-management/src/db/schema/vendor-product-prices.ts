import {
  pgTable,
  uuid,
  numeric,
  timestamp,
  check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vendorProducts } from "./vendor-products.js";

export const vendorProductPrices = pgTable(
  "vendor_product_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vendorProductId: uuid("vendor_product_id")
      .notNull()
      .references(() => vendorProducts.id),

    price: numeric("price", {
      precision: 12,
      scale: 2
    }).notNull(),

    effectiveFrom: timestamp("effective_from", {
      withTimezone: true
    }).notNull(),

    effectiveTo: timestamp("effective_to", {
      withTimezone: true
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true
    }).notNull().defaultNow()
  },
  (table) => [
    check(
      "vendor_product_prices_price_check",
      sql`${table.price} >= 0`
    )
  ]
);
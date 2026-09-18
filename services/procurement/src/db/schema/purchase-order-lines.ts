import {
  pgTable,
  uuid,
  integer,
  numeric,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { purchaseOrders } from "./purchase-orders.js";

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),

    productId: uuid("product_id").notNull(),

    quantityOrdered: integer("quantity_ordered").notNull(),

    quantityReceived: integer("quantity_received")
      .notNull()
      .default(0),

    unitPrice: numeric("unit_price", {
      precision: 12,
      scale: 2,
    }).notNull(),

    lineTotal: numeric("line_total", {
      precision: 14,
      scale: 2,
    }).notNull(),

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
    check(
      "purchase_order_lines_quantity_ordered_positive",
      sql`${table.quantityOrdered} > 0`,
    ),

    check(
      "purchase_order_lines_quantity_received_non_negative",
      sql`${table.quantityReceived} >= 0`,
    ),

    check(
      "purchase_order_lines_quantity_received_not_exceed_ordered",
      sql`${table.quantityReceived} <= ${table.quantityOrdered}`,
    ),

    check(
      "purchase_order_lines_unit_price_non_negative",
      sql`${table.unitPrice} >= 0`,
    ),

    check(
      "purchase_order_lines_line_total_non_negative",
      sql`${table.lineTotal} >= 0`,
    ),
  ],
);
import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { purchaseOrders } from "./purchase-orders.js";

export const purchaseOrderAmendments = pgTable(
  "purchase_order_amendments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),

    amendmentNumber: integer("amendment_number").notNull(),

    reason: text("reason").notNull(),

    previousData: jsonb("previous_data").notNull(),

    newData: jsonb("new_data").notNull(),

    requestedBy: uuid("requested_by").notNull(),

    approvedBy: uuid("approved_by"),

    status: varchar("status", {
      length: 20,
    })
      .notNull()
      .default("PENDING"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    approvedAt: timestamp("approved_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    unique("purchase_order_amendments_po_number_unique").on(
      table.purchaseOrderId,
      table.amendmentNumber,
    ),
  ],
);
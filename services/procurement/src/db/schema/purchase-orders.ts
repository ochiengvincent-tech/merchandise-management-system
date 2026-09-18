import {
  pgTable,
  uuid,
  varchar,
  char,
  numeric,
  text,
  timestamp,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    poNumber: varchar("po_number", {
      length: 50,
    }).notNull(),

    vendorId: uuid("vendor_id").notNull(),

    destinationLocationId: uuid("destination_location_id").notNull(),

    status: varchar("status", {
      length: 30,
    })
      .notNull()
      .default("DRAFT"),

    currency: char("currency", {
      length: 3,
    })
      .notNull()
      .default("KES"),
    paymentTerms: varchar("payment_terms", {
      length: 50,
    })
      .notNull()
      .default("NET_30"),

    subtotal: numeric("subtotal", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),

    totalAmount: numeric("total_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),

    notes: text("notes"),

    createdBy: uuid("created_by").notNull(),

    approvedAt: timestamp("approved_at", {
      withTimezone: true,
    }),

    approvedBy: uuid("approved_by"),

    sentAt: timestamp("sent_at", {
      withTimezone: true,
    }),

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
    unique("purchase_orders_po_number_unique").on(table.poNumber),

    check("purchase_orders_subtotal_non_negative", sql`${table.subtotal} >= 0`),

    check(
      "purchase_orders_total_amount_non_negative",
      sql`${table.totalAmount} >= 0`,
    ),
  ],
);

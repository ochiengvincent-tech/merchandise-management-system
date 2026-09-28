import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";

export type ReliabilityOrderLineSnapshot = {
  purchaseOrderLineId: string;
  productId: string;
  quantityOrdered: number;
  leadTimeDays: number | null;
};

export type ReliabilityReceiptLine = {
  purchaseOrderLineId: string | null;
  quantityObserved: number;
  quantityDamaged: number;
  quantityAccepted: number;
};

export const vendorReliabilityOrders = pgTable(
  "vendor_reliability_orders",
  {
    purchaseOrderId: uuid("purchase_order_id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    poNumber: varchar("po_number", { length: 50 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lines: jsonb("lines").$type<ReliabilityOrderLineSnapshot[]>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    orderedUnits: integer("ordered_units").notNull(),
    observedUnits: integer("observed_units").notNull().default(0),
    acceptedUnits: integer("accepted_units").notNull().default(0),
    damagedUnits: integer("damaged_units").notNull().default(0),
    acceptedOnTimeUnits: integer("accepted_on_time_units").notNull().default(0),
    onTimeRate: integer("on_time_rate").notNull().default(0),
    fulfillmentRate: integer("fulfillment_rate").notNull().default(0),
    qualityRate: integer("quality_rate").notNull().default(0),
    score: integer("score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_reliability_orders_vendor_id_idx").on(table.vendorId),
    index("vendor_reliability_orders_sent_at_idx").on(table.sentAt),
    check("vendor_reliability_orders_status_check", sql`${table.status} IN ('OPEN', 'COMPLETED', 'CANCELLED')`),
    check("vendor_reliability_orders_units_non_negative", sql`${table.orderedUnits} > 0 AND ${table.observedUnits} >= 0 AND ${table.acceptedUnits} >= 0 AND ${table.damagedUnits} >= 0 AND ${table.acceptedOnTimeUnits} >= 0`),
    check("vendor_reliability_orders_rates_range", sql`${table.onTimeRate} BETWEEN 0 AND 100 AND ${table.fulfillmentRate} BETWEEN 0 AND 100 AND ${table.qualityRate} BETWEEN 0 AND 100 AND ${table.score} BETWEEN 0 AND 100`),
  ],
);

export const vendorReliabilityReceipts = pgTable(
  "vendor_reliability_receipts",
  {
    goodsReceiptId: uuid("goods_receipt_id").primaryKey(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    lines: jsonb("lines").$type<ReliabilityReceiptLine[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_reliability_receipts_po_id_idx").on(table.purchaseOrderId),
    index("vendor_reliability_receipts_vendor_id_idx").on(table.vendorId),
  ],
);

export const vendorReliabilitySummaries = pgTable(
  "vendor_reliability_summaries",
  {
    vendorId: uuid("vendor_id")
      .primaryKey()
      .references(() => vendors.id),
    score: integer("score").notNull(),
    onTimeRate: integer("on_time_rate").notNull(),
    fulfillmentRate: integer("fulfillment_rate").notNull(),
    qualityRate: integer("quality_rate").notNull(),
    eligiblePurchaseOrders: integer("eligible_purchase_orders").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    formulaVersion: varchar("formula_version", { length: 20 }).notNull().default("v1"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("vendor_reliability_summaries_score_range", sql`${table.score} BETWEEN 0 AND 100 AND ${table.onTimeRate} BETWEEN 0 AND 100 AND ${table.fulfillmentRate} BETWEEN 0 AND 100 AND ${table.qualityRate} BETWEEN 0 AND 100`),
    check("vendor_reliability_summaries_po_count_non_negative", sql`${table.eligiblePurchaseOrders} >= 0`),
  ],
);

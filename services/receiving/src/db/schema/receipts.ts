import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey(),
    grnNumber: varchar("grn_number", { length: 50 }).notNull(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    destinationLocationId: uuid("destination_location_id").notNull(),
    supplierDeliveryNote: varchar("supplier_delivery_note", { length: 100 }),
    receivedBy: uuid("received_by").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    procurementSyncStatus: varchar("procurement_sync_status", { length: 20 })
      .notNull()
      .default("PENDING"),
    procurementSyncError: text("procurement_sync_error"),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("goods_receipts_grn_number_unique").on(table.grnNumber),
    index("goods_receipts_purchase_order_id_idx").on(table.purchaseOrderId),
    index("goods_receipts_sync_status_idx").on(table.procurementSyncStatus),
    check(
      "goods_receipts_procurement_sync_status_check",
      sql`${table.procurementSyncStatus} IN ('PENDING', 'SYNCED', 'RETRYING')`,
    ),
  ],
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    purchaseOrderLineId: uuid("purchase_order_line_id"),
    productId: uuid("product_id").notNull(),
    productCode: varchar("product_code", { length: 100 }).notNull(),
    productName: varchar("product_name", { length: 255 }),
    quantityExpectedAtReceipt: integer("quantity_expected_at_receipt")
      .notNull()
      .default(0),
    quantityObserved: integer("quantity_observed").notNull(),
    quantityDamaged: integer("quantity_damaged").notNull().default(0),
    quantityAccepted: integer("quantity_accepted").notNull(),
    condition: varchar("condition", { length: 20 }).notNull(),
    discrepancies: jsonb("discrepancies").$type<string[]>().notNull().default([]),
    notes: text("notes"),
  },
  (table) => [
    index("goods_receipt_lines_goods_receipt_id_idx").on(table.goodsReceiptId),
    index("goods_receipt_lines_purchase_order_line_id_idx").on(
      table.purchaseOrderLineId,
    ),
    check(
      "goods_receipt_lines_expected_non_negative",
      sql`${table.quantityExpectedAtReceipt} >= 0`,
    ),
    check(
      "goods_receipt_lines_observed_non_negative",
      sql`${table.quantityObserved} >= 0`,
    ),
    check(
      "goods_receipt_lines_damaged_non_negative",
      sql`${table.quantityDamaged} >= 0 AND ${table.quantityDamaged} <= ${table.quantityObserved}`,
    ),
    check(
      "goods_receipt_lines_accepted_non_negative",
      sql`${table.quantityAccepted} >= 0 AND ${table.quantityAccepted} <= ${table.quantityObserved} - ${table.quantityDamaged}`,
    ),
    check(
      "goods_receipt_lines_condition_check",
      sql`${table.condition} IN ('GOOD', 'DAMAGED', 'MIXED')`,
    ),
  ],
);

export const receivingAuditLogs = pgTable(
  "receiving_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    actorId: uuid("actor_id").notNull(),
    goodsReceiptId: uuid("goods_receipt_id").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("receiving_audit_logs_goods_receipt_id_idx").on(table.goodsReceiptId),
    index("receiving_audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const receivingOutboxEvents = pgTable(
  "receiving_outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    unique("receiving_outbox_events_event_id_unique").on(table.eventId),
    index("receiving_outbox_events_status_idx").on(table.status),
    check(
      "receiving_outbox_events_attempts_non_negative",
      sql`${table.attempts} >= 0`,
    ),
    check(
      "receiving_outbox_events_status_check",
      sql`${table.status} IN ('PENDING', 'PUBLISHED', 'FAILED')`,
    ),
  ],
);

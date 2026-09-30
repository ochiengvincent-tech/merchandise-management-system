import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const retailRegisters = pgTable("retail_registers", {
  id: uuid("id").defaultRandom().primaryKey(), code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(), inventoryLocationId: uuid("inventory_location_id").notNull(),
  active: varchar("active", { length: 10 }).notNull().default("ACTIVE"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("retail_registers_active_check", sql`${t.active} IN ('ACTIVE', 'INACTIVE')`)]);

export const retailPrices = pgTable("retail_prices", {
  id: uuid("id").defaultRandom().primaryKey(), productId: uuid("product_id").notNull(),
  amountMinor: integer("amount_minor").notNull(), currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  taxRateBps: integer("tax_rate_bps").notNull().default(0), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }), createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("retail_prices_product_effective_idx").on(t.productId, t.effectiveFrom), check("retail_prices_amount_check", sql`${t.amountMinor} >= 0`), check("retail_prices_tax_check", sql`${t.taxRateBps} >= 0 AND ${t.taxRateBps} <= 10000`), check("retail_prices_window_check", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`)]);

export const retailSales = pgTable("retail_sales", {
  id: uuid("id").defaultRandom().primaryKey(), receiptNumber: varchar("receipt_number", { length: 50 }).notNull().unique(),
  registerId: uuid("register_id").notNull().references(() => retailRegisters.id), inventoryLocationId: uuid("inventory_location_id").notNull(), warehouseManaged: boolean("warehouse_managed").notNull().default(false),
  actorId: uuid("actor_id").notNull(), status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"), subtotalMinor: integer("subtotal_minor"), taxMinor: integer("tax_minor"), totalMinor: integer("total_minor"),
  idempotencyKey: uuid("idempotency_key").notNull().unique(), requestHash: varchar("request_hash", { length: 64 }).notNull(),
  reservationPlan: jsonb("reservation_plan").notNull(), failureMessage: varchar("failure_message", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [index("retail_sales_register_created_idx").on(t.registerId, t.createdAt), check("retail_sales_status_check", sql`${t.status} IN ('PENDING', 'COMPLETED', 'FAILED')`)]);

export const retailSaleLines = pgTable("retail_sale_lines", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => retailSales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull(), reservationId: uuid("reservation_id").notNull(), skuSnapshot: varchar("sku_snapshot", { length: 100 }).notNull(),
  nameSnapshot: varchar("name_snapshot", { length: 255 }).notNull(), quantity: integer("quantity").notNull(), unitPriceMinor: integer("unit_price_minor").notNull(),
  taxRateBps: integer("tax_rate_bps").notNull(), taxMinor: integer("tax_minor").notNull(), lineTotalMinor: integer("line_total_minor").notNull(),
}, (t) => [index("retail_sale_lines_sale_idx").on(t.saleId), check("retail_sale_lines_qty_check", sql`${t.quantity} > 0`)]);

export const retailTenders = pgTable("retail_tenders", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => retailSales.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 20 }).notNull(), amountMinor: integer("amount_minor").notNull(), currency: varchar("currency", { length: 3 }).notNull(),
  reference: varchar("reference", { length: 150 }), status: varchar("status", { length: 20 }).notNull().default("RECORDED"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("retail_tenders_method_check", sql`${t.method} IN ('CASH', 'CARD', 'GIFT_CARD')`), check("retail_tenders_amount_check", sql`${t.amountMinor} > 0`), check("retail_tenders_status_check", sql`${t.status} IN ('RECORDED')`)]);

export const retailAuditLogs = pgTable("retail_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(), action: varchar("action", { length: 100 }).notNull(), actorId: uuid("actor_id").notNull(),
  recordId: uuid("record_id").notNull(), details: jsonb("details").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("retail_audit_record_idx").on(t.recordId), index("retail_audit_created_idx").on(t.createdAt)]);

export const retailOutboxEvents = pgTable("retail_outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(), eventId: uuid("event_id").notNull().unique(), eventType: varchar("event_type", { length: 100 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 100 }).notNull(), aggregateId: uuid("aggregate_id").notNull(), payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(), publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [index("retail_outbox_status_idx").on(t.status), check("retail_outbox_attempts_check", sql`${t.attempts} >= 0`), check("retail_outbox_status_check", sql`${t.status} IN ('PENDING', 'PUBLISHED', 'FAILED')`)]);

export const retailProcessedEvents = pgTable("retail_processed_events", {
  eventId: uuid("event_id").primaryKey(), eventType: varchar("event_type", { length: 100 }).notNull(), processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const retailReturns = pgTable("retail_returns", {
  id: uuid("id").defaultRandom().primaryKey(), returnNumber: varchar("return_number", { length: 50 }).notNull().unique(),
  saleId: uuid("sale_id").notNull().references(() => retailSales.id), actorId: uuid("actor_id").notNull(), reason: varchar("reason", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("RECORDED"), totalRefundMinor: integer("total_refund_minor").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull().unique(), requestHash: varchar("request_hash", { length: 64 }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("retail_returns_sale_idx").on(t.saleId), check("retail_returns_status_check", sql`${t.status} = 'RECORDED'`), check("retail_returns_total_check", sql`${t.totalRefundMinor} >= 0`)]);

export const retailReturnLines = pgTable("retail_return_lines", {
  id: uuid("id").defaultRandom().primaryKey(), returnId: uuid("return_id").notNull().references(() => retailReturns.id, { onDelete: "cascade" }),
  saleLineId: uuid("sale_line_id").notNull().references(() => retailSaleLines.id), productId: uuid("product_id").notNull(), quantity: integer("quantity").notNull(),
  refundMinor: integer("refund_minor").notNull(), disposition: varchar("disposition", { length: 24 }).notNull(),
}, (t) => [index("retail_return_lines_sale_line_idx").on(t.saleLineId), check("retail_return_lines_quantity_check", sql`${t.quantity} > 0`), check("retail_return_lines_disposition_check", sql`${t.disposition} IN ('RESTOCK_SELLABLE', 'QUARANTINE', 'NO_STOCK_RETURN')`)]);

export const retailReturnTenders = pgTable("retail_return_tenders", {
  id: uuid("id").defaultRandom().primaryKey(), returnId: uuid("return_id").notNull().references(() => retailReturns.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 20 }).notNull(), amountMinor: integer("amount_minor").notNull(), reference: varchar("reference", { length: 150 }),
  status: varchar("status", { length: 20 }).notNull().default("RECORDED"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("retail_return_tenders_method_check", sql`${t.method} IN ('CASH', 'CARD', 'GIFT_CARD')`), check("retail_return_tenders_amount_check", sql`${t.amountMinor} > 0`), check("retail_return_tenders_status_check", sql`${t.status} = 'RECORDED'`)]);

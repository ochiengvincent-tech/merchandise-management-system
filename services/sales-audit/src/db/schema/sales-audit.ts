import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const salesAuditSessions = pgTable("sales_audit_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  registerId: uuid("register_id").notNull(),
  locationId: uuid("location_id").notNull(),
  registerCode: varchar("register_code", { length: 50 }).notNull(),
  registerName: varchar("register_name", { length: 150 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  status: varchar("status", { length: 20 }).notNull().default("OPEN"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  openedBy: uuid("opened_by").notNull(),
  openingFloatMinor: integer("opening_float_minor").notNull().default(0),
  openIdempotencyKey: uuid("open_idempotency_key").notNull().unique(),
  openRequestHash: varchar("open_request_hash", { length: 64 }).notNull(),
  reconciliationStatus: varchar("reconciliation_status", { length: 20 }).notNull().default("PENDING"),
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  lastReconciliationDetails: jsonb("last_reconciliation_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sales_audit_sessions_register_opened_idx").on(t.registerId, t.openedAt),
  index("sales_audit_sessions_status_opened_idx").on(t.status, t.openedAt),
  check("sales_audit_sessions_status_check", sql`${t.status} IN ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXCEPTION')`),
  check("sales_audit_sessions_reconciliation_check", sql`${t.reconciliationStatus} IN ('PENDING', 'MATCHED', 'MISMATCH', 'UNAVAILABLE')`),
  check("sales_audit_sessions_opening_float_check", sql`${t.openingFloatMinor} >= 0`),
  uniqueIndex("sales_audit_sessions_active_register_unique").on(t.registerId).where(sql`${t.status} IN ('OPEN', 'SUBMITTED', 'REJECTED', 'EXCEPTION')`),
]);

export const salesAuditTransactions = pgTable("sales_audit_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceEventId: uuid("source_event_id").notNull().unique(),
  sourceEventType: varchar("source_event_type", { length: 50 }).notNull(),
  transactionId: uuid("transaction_id").notNull(),
  originalSaleId: uuid("original_sale_id"),
  receiptNumber: varchar("receipt_number", { length: 50 }),
  registerId: uuid("register_id").notNull(),
  locationId: uuid("location_id").notNull(),
  actorId: uuid("actor_id").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("sales_audit_transactions_type_id_unique").on(t.direction, t.transactionId),
  index("sales_audit_transactions_register_time_idx").on(t.registerId, t.occurredAt),
  check("sales_audit_transactions_direction_check", sql`${t.direction} IN ('SALE', 'REFUND')`),
]);

export const salesAuditTransactionTenders = pgTable("sales_audit_transaction_tenders", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionRecordId: uuid("transaction_record_id").notNull().references(() => salesAuditTransactions.id, { onDelete: "cascade" }),
  sourceTenderId: varchar("source_tender_id", { length: 100 }).notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull().default("RECORDED"),
}, (t) => [
  unique("sales_audit_transaction_tenders_source_unique").on(t.transactionRecordId, t.sourceTenderId),
  check("sales_audit_transaction_tenders_method_check", sql`${t.method} IN ('CASH', 'CARD', 'GIFT_CARD')`),
  check("sales_audit_transaction_tenders_amount_check", sql`${t.amountMinor} > 0`),
  check("sales_audit_transaction_tenders_outcome_check", sql`${t.outcome} IN ('RECORDED', 'SUCCEEDED')`),
]);

export const salesAuditCloseSubmissions = pgTable("sales_audit_close_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => salesAuditSessions.id),
  submissionNumber: integer("submission_number").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  submittedBy: uuid("submitted_by").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
  countedTotals: jsonb("counted_totals").notNull(),
  varianceExplanations: jsonb("variance_explanations").notNull(),
  reconciliationStatus: varchar("reconciliation_status", { length: 20 }).notNull().default("PENDING"),
  sourceSnapshotAt: timestamp("source_snapshot_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("sales_audit_close_submissions_session_number_unique").on(t.sessionId, t.submissionNumber),
  index("sales_audit_close_submissions_session_idx").on(t.sessionId, t.createdAt),
  check("sales_audit_close_submissions_number_check", sql`${t.submissionNumber} > 0`),
  check("sales_audit_close_submissions_reconciliation_check", sql`${t.reconciliationStatus} IN ('PENDING', 'MATCHED', 'MISMATCH', 'UNAVAILABLE')`),
]);

export const salesAuditDecisions = pgTable("sales_audit_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => salesAuditSessions.id),
  submissionId: uuid("submission_id").notNull().references(() => salesAuditCloseSubmissions.id),
  action: varchar("action", { length: 20 }).notNull(),
  actorId: uuid("actor_id").notNull(),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sales_audit_decisions_session_created_idx").on(t.sessionId, t.createdAt),
  check("sales_audit_decisions_action_check", sql`${t.action} IN ('APPROVED', 'REJECTED')`),
]);

export const salesAuditLogs = pgTable("sales_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id"),
  action: varchar("action", { length: 100 }).notNull(),
  actorId: uuid("actor_id").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sales_audit_logs_session_created_idx").on(t.sessionId, t.createdAt)]);

export const salesAuditProcessedEvents = pgTable("sales_audit_processed_events", {
  eventId: uuid("event_id").primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

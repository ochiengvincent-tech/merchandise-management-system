import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, date, index, integer, jsonb, pgTable, timestamp,
  unique, uniqueIndex, uuid, varchar, type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  accountType: varchar("account_type", { length: 20 }).notNull(),
  normalBalance: varchar("normal_balance", { length: 6 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  parentCode: varchar("parent_code", { length: 30 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("financial_accounts_type_check", sql`${t.accountType} IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')`),
  check("financial_accounts_normal_balance_check", sql`${t.normalBalance} IN ('DEBIT','CREDIT')`),
]);

export const financialPeriods = pgTable("financial_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  periodKey: varchar("period_key", { length: 7 }).notNull().unique(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  status: varchar("status", { length: 10 }).notNull().default("OPEN"),
  closedBy: uuid("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedBy: uuid("reopened_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: varchar("reopen_reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("financial_periods_status_check", sql`${t.status} IN ('OPEN','CLOSED')`)]);

export const financialJournals = pgTable("financial_journals", {
  id: uuid("id").defaultRandom().primaryKey(),
  journalNumber: varchar("journal_number", { length: 40 }).notNull().unique(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceId: uuid("source_id"),
  sourceEventId: uuid("source_event_id"),
  postingRuleVersion: integer("posting_rule_version").notNull().default(1),
  periodId: uuid("period_id").notNull().references(() => financialPeriods.id),
  accountingDate: date("accounting_date").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  actorId: uuid("actor_id"),
  reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => financialJournals.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("financial_journals_source_event_rule_unique").on(t.sourceEventId, t.postingRuleVersion),
  uniqueIndex("financial_journals_reversal_unique").on(t.reversalOfId).where(sql`${t.reversalOfId} IS NOT NULL`),
  index("financial_journals_date_idx").on(t.accountingDate, t.id),
  index("financial_journals_source_idx").on(t.sourceType, t.sourceId),
]);

export const financialJournalLines = pgTable("financial_journal_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  journalId: uuid("journal_id").notNull().references(() => financialJournals.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  accountCode: varchar("account_code", { length: 30 }).notNull().references(() => financialAccounts.code, { onDelete: "restrict" }),
  debitMinor: bigint("debit_minor", { mode: "bigint" }).notNull().default(0n),
  creditMinor: bigint("credit_minor", { mode: "bigint" }).notNull().default(0n),
  locationId: uuid("location_id"),
  productId: uuid("product_id"),
  vendorId: uuid("vendor_id"),
  memo: varchar("memo", { length: 500 }),
}, (t) => [
  unique("financial_journal_lines_number_unique").on(t.journalId, t.lineNumber),
  index("financial_journal_lines_account_idx").on(t.accountCode, t.journalId),
  check("financial_journal_lines_positive_check", sql`${t.debitMinor} >= 0 AND ${t.creditMinor} >= 0`),
  check("financial_journal_lines_one_side_check", sql`(${t.debitMinor} > 0 AND ${t.creditMinor} = 0) OR (${t.creditMinor} > 0 AND ${t.debitMinor} = 0)`),
]);

export const financialProcessedEvents = pgTable("financial_processed_events", {
  eventId: uuid("event_id").primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  sourceId: uuid("source_id"),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  payload: jsonb("payload").notNull(),
  journalId: uuid("journal_id").references(() => financialJournals.id, { onDelete: "restrict" }),
  attempts: integer("attempts").notNull().default(0),
  lastError: varchar("last_error", { length: 1000 }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  index("financial_processed_events_status_received_idx").on(t.status, t.receivedAt),
  check("financial_processed_events_status_check", sql`${t.status} IN ('PENDING','POSTED','EXCEPTION')`),
  check("financial_processed_events_attempts_check", sql`${t.attempts} >= 0`),
]);

export const financialPostingMappings = pgTable("financial_posting_mappings", {
  mappingKey: varchar("mapping_key", { length: 60 }).primaryKey(),
  accountCode: varchar("account_code", { length: 30 }).notNull().references(() => financialAccounts.code, { onDelete: "restrict" }),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financialSupplierInvoices = pgTable("financial_supplier_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  currency: varchar("currency", { length: 3 }).notNull(),
  taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(0n),
  totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
  attachmentReference: varchar("attachment_reference", { length: 500 }),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  exceptionReason: varchar("exception_reason", { length: 1000 }),
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  createdBy: uuid("created_by").notNull(),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  journalId: uuid("journal_id").references(() => financialJournals.id, { onDelete: "restrict" }),
}, (t) => [
  unique("financial_supplier_invoices_vendor_number_unique").on(t.vendorId, t.invoiceNumber),
  check("financial_supplier_invoices_amounts_check", sql`${t.taxMinor} >= 0 AND ${t.totalMinor} >= ${t.taxMinor}`),
  check("financial_supplier_invoices_status_check", sql`${t.status} IN ('DRAFT','MATCHED','EXCEPTION','POSTED')`),
  index("financial_supplier_invoices_status_date_idx").on(t.status, t.invoiceDate),
]);

export const financialSupplierInvoiceLines = pgTable("financial_supplier_invoice_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => financialSupplierInvoices.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  purchaseOrderId: uuid("purchase_order_id").notNull(),
  purchaseOrderLineId: uuid("purchase_order_line_id").notNull(),
  goodsReceiptId: uuid("goods_receipt_id").notNull(),
  goodsReceiptLineId: uuid("goods_receipt_line_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
  taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(0n),
  lineTotalMinor: bigint("line_total_minor", { mode: "bigint" }).notNull(),
}, (t) => [
  unique("financial_supplier_invoice_lines_number_unique").on(t.invoiceId, t.lineNumber),
  check("financial_supplier_invoice_lines_amount_check", sql`${t.quantity} > 0 AND ${t.unitPriceMinor} >= 0 AND ${t.taxMinor} >= 0 AND ${t.lineTotalMinor} >= ${t.taxMinor}`),
]);

export const financialAuditLogs = pgTable("financial_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  actorId: uuid("actor_id"),
  recordType: varchar("record_type", { length: 50 }).notNull(),
  recordId: uuid("record_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("financial_audit_logs_created_idx").on(t.createdAt)]);

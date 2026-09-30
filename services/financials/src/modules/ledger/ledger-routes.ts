import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { financialAccounts, financialAuditLogs, financialJournalLines, financialJournals, financialPeriods, financialProcessedEvents, financialPostingMappings } from "../../db/schema/financials.js";
import { AppError } from "../../errors/app-error.js";
import { postJournal, postingMappings, type JournalLineInput } from "./posting-service.js";
import { retryFinancialEvent } from "../events/financial-event-service.js";

export const ledgerRouter: Router = Router();
const idSchema = z.uuid();
const actor = (req: { header: (name: string) => string | undefined }) => {
  const parsed = idSchema.safeParse(req.header("x-actor-id"));
  if (!parsed.success) throw new AppError("A valid actor ID is required", 400, [{ field: "x-actor-id", message: "Provide a valid UUID." }]);
  return parsed.data;
};
const listSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), action: z.string().trim().max(100).optional(), accountCode: z.string().trim().max(30).optional(), sourceType: z.string().trim().max(50).optional(), actorId: idSchema.optional(), from: z.iso.date().optional(), to: z.iso.date().optional() });

ledgerRouter.get("/accounts", async (_req, res) => {
  const data = await db.select().from(financialAccounts).orderBy(asc(financialAccounts.code));
  return res.json({ data });
});
ledgerRouter.post("/accounts", async (req, res) => {
  const actorId = actor(req);
  const body = z.object({ code: z.string().trim().regex(/^\d{3,10}$/), name: z.string().trim().min(2).max(150), accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]), normalBalance: z.enum(["DEBIT", "CREDIT"]), currency: z.string().regex(/^[A-Z]{3}$/).default("KES"), parentCode: z.string().trim().regex(/^\d{3,10}$/).optional() }).parse(req.body);
  if (body.currency !== "KES") throw new AppError("Only KES accounts can be created until multi-currency posting is enabled", 400, [{ field: "currency", message: "Use KES for this Financials release." }]);
  const [account] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(financialAccounts).values({ ...body, parentCode: body.parentCode ?? null }).returning();
    if (!created) throw new Error("Account was not created");
    await tx.insert(financialAuditLogs).values({ action: "ACCOUNT_CREATED", actorId, recordType: "ACCOUNT", recordId: created.id, details: { code: created.code, name: created.name, accountType: created.accountType, normalBalance: created.normalBalance } });
    return [created];
  });
  return res.status(201).json({ data: account });
});

ledgerRouter.get("/posting-mappings", async (_req, res) => {
  const data = await db.select({ mappingKey: financialPostingMappings.mappingKey, accountCode: financialPostingMappings.accountCode, accountName: financialAccounts.name, updatedBy: financialPostingMappings.updatedBy, updatedAt: financialPostingMappings.updatedAt }).from(financialPostingMappings).innerJoin(financialAccounts, eq(financialAccounts.code, financialPostingMappings.accountCode)).orderBy(asc(financialPostingMappings.mappingKey));
  return res.json({ data });
});
ledgerRouter.put("/posting-mappings/:mappingKey", async (req, res) => {
  const actorId = actor(req);
  const params = z.object({ mappingKey: z.string().regex(/^[A-Z_]{2,60}$/) }).parse(req.params);
  const { accountCode } = z.object({ accountCode: z.string().regex(/^\d{3,10}$/) }).parse(req.body);
  const expected = postingMappings[params.mappingKey as keyof typeof postingMappings];
  if (!expected) throw new AppError("Unsupported posting mapping", 400, [{ field: "mappingKey", message: "Select a mapping defined by Financials." }]);
  const [account] = await db.select().from(financialAccounts).where(eq(financialAccounts.code, accountCode)).limit(1);
  if (!account || !account.active || account.currency !== "KES") throw new AppError("Choose an active KES ledger account", 400, [{ field: "accountCode", message: "Select an active KES account." }]);
  if (account.accountType !== expected[0] || account.normalBalance !== expected[1]) throw new AppError("This mapping requires a " + expected[0] + " account with " + expected[1] + " normal balance", 400, [{ field: "accountCode", message: "Choose an account with the required type and normal balance." }]);
  const [mapping] = await db.transaction(async (tx) => {
    const [saved] = await tx.insert(financialPostingMappings).values({ mappingKey: params.mappingKey, accountCode, updatedBy: actorId, updatedAt: new Date() }).onConflictDoUpdate({ target: financialPostingMappings.mappingKey, set: { accountCode, updatedBy: actorId, updatedAt: new Date() } }).returning();
    if (!saved) throw new Error("Posting mapping was not saved");
    await tx.insert(financialAuditLogs).values({ action: "POSTING_MAPPING_CHANGED", actorId, recordType: "POSTING_MAPPING", details: { mappingKey: params.mappingKey, accountCode } });
    return [saved];
  });
  return res.json({ data: mapping });
});

ledgerRouter.get("/journals", async (req, res) => {
  const query = listSchema.parse(req.query);
  if (query.from && query.to && query.from > query.to) throw new AppError("Invalid journal date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  const conditions = [];
  if (query.sourceType) conditions.push(eq(financialJournals.sourceType, query.sourceType));
  if (query.actorId) conditions.push(eq(financialJournals.actorId, query.actorId));
  if (query.from) conditions.push(gte(financialJournals.accountingDate, query.from));
  if (query.to) conditions.push(lte(financialJournals.accountingDate, query.to));
  if (query.accountCode) {
    const matching = await db.selectDistinct({ journalId: financialJournalLines.journalId }).from(financialJournalLines).where(eq(financialJournalLines.accountCode, query.accountCode));
    conditions.push(inArray(financialJournals.id, matching.map((row) => row.journalId)));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [totalRow]] = await Promise.all([
    db.select().from(financialJournals).where(where).orderBy(desc(financialJournals.accountingDate), desc(financialJournals.createdAt), desc(financialJournals.id)).limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(financialJournals).where(where),
  ]);
  const ids = data.map((row) => row.id);
  const summaries = ids.length ? await db.select({ journalId: financialJournalLines.journalId, debit: sql<string>`sum(${financialJournalLines.debitMinor})`, credit: sql<string>`sum(${financialJournalLines.creditMinor})` }).from(financialJournalLines).where(inArray(financialJournalLines.journalId, ids)).groupBy(financialJournalLines.journalId) : [];
  const amounts = new Map(summaries.map((row) => [row.journalId, { debitMinor: row.debit ?? "0", creditMinor: row.credit ?? "0" }]));
  const total = Number(totalRow?.total ?? 0);
  return res.json({ data: data.map((row) => ({ ...row, ...amounts.get(row.id) })), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
});
ledgerRouter.get("/journals/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const [journal] = await db.select().from(financialJournals).where(eq(financialJournals.id, id)).limit(1);
  if (!journal) throw new AppError("Journal not found", 404);
  const lines = await db.select().from(financialJournalLines).where(eq(financialJournalLines.journalId, id)).orderBy(asc(financialJournalLines.lineNumber));
  return res.json({ data: { ...journal, lines: lines.map((line) => ({ ...line, debitMinor: line.debitMinor.toString(), creditMinor: line.creditMinor.toString() })) } });
});
ledgerRouter.post("/journals/:id/reverse", async (req, res) => {
  const actorId = actor(req);
  const id = idSchema.parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const result = await db.transaction(async (tx) => {
    const [original] = await tx.select().from(financialJournals).where(eq(financialJournals.id, id)).for("update").limit(1);
    if (!original) throw new AppError("Journal not found", 404);
    if (original.reversalOfId) throw new AppError("A reversal journal cannot be reversed", 409);
    const [existing] = await tx.select().from(financialJournals).where(eq(financialJournals.reversalOfId, id)).limit(1);
    if (existing) return existing;
    const originals = await tx.select().from(financialJournalLines).where(eq(financialJournalLines.journalId, id)).orderBy(asc(financialJournalLines.lineNumber));
    const reversalLines: JournalLineInput[] = originals.map((line) => ({ accountCode: line.accountCode, debitMinor: line.creditMinor, creditMinor: line.debitMinor, locationId: line.locationId, productId: line.productId, vendorId: line.vendorId, memo: `Reversal: ${reason}` }));
    const reversal = await postJournal(tx, { sourceType: "JOURNAL_REVERSAL", sourceId: original.id, reversalOfId: original.id, accountingDate: new Date(), currency: original.currency, description: `Reversal of ${original.journalNumber}: ${reason}`, actorId, lines: reversalLines });
    await tx.insert(financialAuditLogs).values({ action: "JOURNAL_REVERSED", actorId, recordType: "JOURNAL", recordId: original.id, details: { reversalJournalId: reversal.id, reason } });
    return reversal;
  });
  return res.status(201).json({ data: result });
});

ledgerRouter.get("/reports/trial-balance", async (req, res) => {
  const query = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), currency: z.string().regex(/^[A-Z]{3}$/).default("KES") }).parse(req.query);
  if (query.from && query.to && query.from > query.to) throw new AppError("Invalid report date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  const filters = [eq(financialJournals.currency, query.currency)];
  if (query.from) filters.push(gte(financialJournals.accountingDate, query.from));
  if (query.to) filters.push(lte(financialJournals.accountingDate, query.to));
  const data = await db.select({ code: financialAccounts.code, name: financialAccounts.name, accountType: financialAccounts.accountType, normalBalance: financialAccounts.normalBalance, debitMinor: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}), 0)::text`, creditMinor: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}), 0)::text` }).from(financialAccounts).leftJoin(financialJournalLines, eq(financialJournalLines.accountCode, financialAccounts.code)).leftJoin(financialJournals, and(eq(financialJournals.id, financialJournalLines.journalId), ...filters)).where(eq(financialAccounts.currency, query.currency)).groupBy(financialAccounts.code, financialAccounts.name, financialAccounts.accountType, financialAccounts.normalBalance).orderBy(asc(financialAccounts.code));
  const totals = data.reduce((sum, row) => ({ debitMinor: sum.debitMinor + BigInt(row.debitMinor), creditMinor: sum.creditMinor + BigInt(row.creditMinor) }), { debitMinor: 0n, creditMinor: 0n });
  return res.json({ data: data.map((row) => ({ ...row, netMinor: (BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() })), currency: query.currency, totals: { debitMinor: totals.debitMinor.toString(), creditMinor: totals.creditMinor.toString(), balanced: totals.debitMinor === totals.creditMinor } });
});
ledgerRouter.get("/reports/income-statement", async (req, res) => {
  const query = z.object({ from: z.iso.date(), to: z.iso.date(), currency: z.string().regex(/^[A-Z]{3}$/).default("KES") }).parse(req.query);
  if (query.from > query.to) throw new AppError("Invalid report date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  const rows = await db.select({ code: financialAccounts.code, name: financialAccounts.name, accountType: financialAccounts.accountType, normalBalance: financialAccounts.normalBalance, debitMinor: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}),0)::text`, creditMinor: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}),0)::text` }).from(financialAccounts).leftJoin(financialJournalLines, eq(financialJournalLines.accountCode, financialAccounts.code)).leftJoin(financialJournals, and(eq(financialJournals.id, financialJournalLines.journalId), gte(financialJournals.accountingDate, query.from), lte(financialJournals.accountingDate, query.to), eq(financialJournals.currency, query.currency))).where(inArray(financialAccounts.accountType, ["REVENUE", "EXPENSE"])).groupBy(financialAccounts.code, financialAccounts.name, financialAccounts.accountType, financialAccounts.normalBalance).orderBy(asc(financialAccounts.code));
  const data = rows.map((row) => ({ ...row, balanceMinor: (row.normalBalance === "CREDIT" ? BigInt(row.creditMinor) - BigInt(row.debitMinor) : BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() }));
  return res.json({ data, from: query.from, to: query.to, currency: query.currency });
});
ledgerRouter.get("/reports/inventory-value", async (req, res) => {
  const query = z.object({
    asOf: z.iso.date().default(new Date().toISOString().slice(0, 10)),
    locationId: idSchema.optional(),
    productId: idSchema.optional(),
  }).parse(req.query);
  const [mapping] = await db.select({ accountCode: financialPostingMappings.accountCode })
    .from(financialPostingMappings).where(eq(financialPostingMappings.mappingKey, "INVENTORY_ASSET")).limit(1);
  if (!mapping) throw new AppError("Inventory asset account mapping is not configured", 409);
  const conditions = [
    eq(financialJournalLines.accountCode, mapping.accountCode),
    lte(financialJournals.accountingDate, query.asOf),
  ];
  if (query.locationId) conditions.push(eq(financialJournalLines.locationId, query.locationId));
  if (query.productId) conditions.push(eq(financialJournalLines.productId, query.productId));
  const rows = await db.select({
    locationId: financialJournalLines.locationId,
    productId: financialJournalLines.productId,
    debitMinor: sql.raw("coalesce(sum(financial_journal_lines.debit_minor), 0)::text").mapWith(String),
    creditMinor: sql.raw("coalesce(sum(financial_journal_lines.credit_minor), 0)::text").mapWith(String),
  }).from(financialJournalLines)
    .innerJoin(financialJournals, eq(financialJournals.id, financialJournalLines.journalId))
    .where(and(...conditions, eq(financialJournals.currency, "KES")))
    .groupBy(financialJournalLines.locationId, financialJournalLines.productId)
    .orderBy(asc(financialJournalLines.locationId), asc(financialJournalLines.productId));
  const data = rows.map((row) => ({ ...row, carryingValueMinor: (BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() }));
  const totalMinor = data.reduce((sum, row) => sum + BigInt(row.carryingValueMinor), 0n);
  return res.json({ data, asOf: query.asOf, currency: "KES", totalMinor: totalMinor.toString() });
});

ledgerRouter.get("/periods", async (_req, res) => {
  const data = await db.select().from(financialPeriods).orderBy(desc(financialPeriods.periodKey)).limit(36);
  return res.json({ data });
});
ledgerRouter.post("/periods/:periodKey/close", async (req, res) => {
  const actorId = actor(req);
  const { periodKey } = z.object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(req.params);
  const result = await db.transaction(async (tx) => {
    const [period] = await tx.select().from(financialPeriods).where(eq(financialPeriods.periodKey, periodKey)).for("update").limit(1);
    if (!period) throw new AppError("Financial period not found", 404);
    if (period.status === "CLOSED") return period;
    const [pending] = await tx.select({ total: count() }).from(financialProcessedEvents).where(and(inArray(financialProcessedEvents.status, ["PENDING", "EXCEPTION"]), gte(financialProcessedEvents.receivedAt, new Date(`${period.startsOn}T00:00:00Z`)), lt(financialProcessedEvents.receivedAt, new Date(`${period.endsOn}T00:00:00Z`))));
    if (Number(pending?.total ?? 0) > 0) throw new AppError("This period has unposted source events", 409, [{ field: "periodKey", message: "Resolve pending and exception events before closing the period." }]);
    const [closed] = await tx.update(financialPeriods).set({ status: "CLOSED", closedBy: actorId, closedAt: new Date() }).where(eq(financialPeriods.id, period.id)).returning();
    await tx.insert(financialAuditLogs).values({ action: "PERIOD_CLOSED", actorId, recordType: "PERIOD", recordId: period.id, details: { periodKey } });
    return closed!;
  });
  return res.json({ data: result });
});
ledgerRouter.post("/periods/:periodKey/reopen", async (req, res) => {
  const actorId = actor(req);
  const { periodKey } = z.object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const result = await db.transaction(async (tx) => {
    const [period] = await tx.select().from(financialPeriods).where(eq(financialPeriods.periodKey, periodKey)).for("update").limit(1);
    if (!period) throw new AppError("Financial period not found", 404);
    if (period.status === "OPEN") return period;
    const [opened] = await tx.update(financialPeriods).set({ status: "OPEN", reopenedBy: actorId, reopenedAt: new Date(), reopenReason: reason }).where(eq(financialPeriods.id, period.id)).returning();
    await tx.insert(financialAuditLogs).values({ action: "PERIOD_REOPENED", actorId, recordType: "PERIOD", recordId: period.id, details: { periodKey, reason } });
    return opened!;
  });
  return res.json({ data: result });
});

ledgerRouter.get("/posting-exceptions", async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(["PENDING", "EXCEPTION"]).default("EXCEPTION") }).parse(req.query);
  const [data, [row]] = await Promise.all([
    db.select({ eventId: financialProcessedEvents.eventId, eventType: financialProcessedEvents.eventType, sourceId: financialProcessedEvents.sourceId, status: financialProcessedEvents.status, lastError: financialProcessedEvents.lastError, attempts: financialProcessedEvents.attempts, receivedAt: financialProcessedEvents.receivedAt, processedAt: financialProcessedEvents.processedAt, journalId: financialProcessedEvents.journalId }).from(financialProcessedEvents).where(eq(financialProcessedEvents.status, query.status)).orderBy(asc(financialProcessedEvents.receivedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(financialProcessedEvents).where(eq(financialProcessedEvents.status, query.status)),
  ]);
  const total = Number(row?.total ?? 0);
  return res.json({ data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
});
ledgerRouter.post("/posting-exceptions/:eventId/retry", async (req, res) => {
  actor(req);
  const eventId = idSchema.parse(req.params.eventId);
  const data = await retryFinancialEvent(eventId);
  return res.json({ data });
});
ledgerRouter.get("/audit-logs", async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), action: z.string().trim().max(100).optional(), actorId: idSchema.optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).parse(req.query);
  const conditions = [];
  if (query.action) conditions.push(eq(financialAuditLogs.action, query.action));
  if (query.actorId) conditions.push(eq(financialAuditLogs.actorId, query.actorId));
  if (query.from) conditions.push(gte(financialAuditLogs.createdAt, new Date(query.from)));
  if (query.to) conditions.push(lte(financialAuditLogs.createdAt, new Date(query.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([db.select().from(financialAuditLogs).where(where).orderBy(desc(financialAuditLogs.createdAt), desc(financialAuditLogs.id)).limit(query.limit).offset((query.page - 1) * query.limit), db.select({ total: count() }).from(financialAuditLogs).where(where)]);
  const total = Number(row?.total ?? 0);
  return res.json({ data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
});

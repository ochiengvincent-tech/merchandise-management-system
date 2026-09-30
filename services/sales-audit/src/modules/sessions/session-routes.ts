import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { salesAuditCloseSubmissions, salesAuditDecisions, salesAuditLogs, salesAuditSessions, salesAuditTransactionTenders, salesAuditTransactions } from "../../db/schema/sales-audit.js";
import { AppError } from "../../errors/app-error.js";
import { getRetailTotals, listRetailRegisters, type RetailTotals } from "../../clients/retail-sales-client.js";

export const sessionRouter: Router = Router();
const uuid = z.uuid();
const methods = ["CASH", "CARD", "GIFT_CARD"] as const;
const actorFrom = (value: string | undefined) => {
  const result = uuid.safeParse(value);
  if (!result.success) throw new AppError("A valid x-actor-id header is required", 400, [{ field: "x-actor-id", message: "Provide the current employee UUID." }]);
  return result.data;
};
const idemFrom = (value: string | undefined) => {
  const result = uuid.safeParse(value);
  if (!result.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Use the same unique UUID when retrying this request." }]);
  return result.data;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type TotalsByMethod = Record<(typeof methods)[number], { saleMinor: number; refundMinor: number; openingMinor: number; expectedMinor: number; countedMinor: number | null; varianceMinor: number | null }>;

async function detail(sessionId: string) {
  const [session] = await db.select().from(salesAuditSessions).where(eq(salesAuditSessions.id, sessionId)).limit(1);
  if (!session) throw new AppError("Register session not found", 404);
  const to = session.closedAt ?? new Date();
  const transactions = await db.select().from(salesAuditTransactions).where(and(
    eq(salesAuditTransactions.registerId, session.registerId), gte(salesAuditTransactions.occurredAt, session.openedAt), lt(salesAuditTransactions.occurredAt, to),
  )).orderBy(salesAuditTransactions.occurredAt);
  const tenderRows = transactions.length ? await db.select().from(salesAuditTransactionTenders).where(inArray(salesAuditTransactionTenders.transactionRecordId, transactions.map((item) => item.id))) : [];
  const latestRows = await db.select().from(salesAuditCloseSubmissions).where(eq(salesAuditCloseSubmissions.sessionId, sessionId)).orderBy(desc(salesAuditCloseSubmissions.submissionNumber)).limit(1);
  const submission = latestRows[0] ?? null;
  const counted = (submission?.countedTotals ?? {}) as Partial<Record<(typeof methods)[number], number>>;
  const sums: TotalsByMethod = { CASH: { saleMinor: 0, refundMinor: 0, openingMinor: session.openingFloatMinor, expectedMinor: 0, countedMinor: null, varianceMinor: null }, CARD: { saleMinor: 0, refundMinor: 0, openingMinor: 0, expectedMinor: 0, countedMinor: null, varianceMinor: null }, GIFT_CARD: { saleMinor: 0, refundMinor: 0, openingMinor: 0, expectedMinor: 0, countedMinor: null, varianceMinor: null } };
  const tenderByTransaction = new Map<string, typeof tenderRows>();
  for (const tender of tenderRows) tenderByTransaction.set(tender.transactionRecordId, [...(tenderByTransaction.get(tender.transactionRecordId) ?? []), tender]);
  for (const transaction of transactions) for (const tender of tenderByTransaction.get(transaction.id) ?? []) {
    const amount = sums[tender.method as (typeof methods)[number]];
    if (!amount) continue;
    if (transaction.direction === "SALE") amount.saleMinor += tender.amountMinor;
    else amount.refundMinor += tender.amountMinor;
  }
  for (const method of methods) {
    const row = sums[method];
    row.expectedMinor = row.openingMinor + row.saleMinor - row.refundMinor;
    if (submission) { row.countedMinor = counted[method] ?? 0; row.varianceMinor = row.countedMinor - row.expectedMinor; }
  }
  const decisions = await db.select().from(salesAuditDecisions).where(eq(salesAuditDecisions.sessionId, sessionId)).orderBy(salesAuditDecisions.createdAt);
  return { ...session, expectedTotals: sums, transactionCount: transactions.length, transactions: transactions.map((item) => ({ ...item, tenders: tenderByTransaction.get(item.id) ?? [] })), submission, decisions };
}

function localSnapshot(session: Awaited<ReturnType<typeof detail>>) {
  const tenderTotals: RetailTotals["tenderTotals"] = { CASH: { saleMinor: 0, refundMinor: 0 }, CARD: { saleMinor: 0, refundMinor: 0 }, GIFT_CARD: { saleMinor: 0, refundMinor: 0 } };
  let saleCount = 0; let returnCount = 0;
  for (const transaction of session.transactions) {
    if (transaction.direction === "SALE") saleCount += 1; else returnCount += 1;
    for (const tender of transaction.tenders) {
      const row = tenderTotals[tender.method];
      if (row) row[transaction.direction === "SALE" ? "saleMinor" : "refundMinor"] += tender.amountMinor;
    }
  }
  return { saleCount, returnCount, tenderTotals };
}

async function compareWithRetail(sessionId: string) {
  const session = await detail(sessionId);
  if (!session.closedAt) throw new AppError("Session has not been submitted", 409);
  try {
    const source = await getRetailTotals(session.registerId, session.openedAt, session.closedAt);
    const local = localSnapshot(session);
    const sourceTotals = { saleCount: source.saleCount, returnCount: source.returnCount, tenderTotals: source.tenderTotals };
    const matches = local.saleCount === source.saleCount && local.returnCount === source.returnCount && methods.every((method) => local.tenderTotals[method].saleMinor === source.tenderTotals[method]?.saleMinor && local.tenderTotals[method].refundMinor === source.tenderTotals[method]?.refundMinor) && methods.every((method) => session.expectedTotals[method].expectedMinor >= 0);
    const reconciliationStatus = matches ? "MATCHED" : "MISMATCH";
    const status = session.status === "APPROVED" || session.status === "EXCEPTION" || session.status === "REJECTED" ? session.status : (matches ? "SUBMITTED" : "EXCEPTION");
    await db.transaction(async (tx) => {
      await tx.update(salesAuditSessions).set({ status, reconciliationStatus, lastSnapshotAt: new Date(source.snapshotAt), lastReconciliationDetails: { local, source: sourceTotals, negativeExpectedMethods: methods.filter((method) => session.expectedTotals[method].expectedMinor < 0), snapshotAt: source.snapshotAt }, updatedAt: new Date() }).where(eq(salesAuditSessions.id, sessionId));
      if (session.submission) await tx.update(salesAuditCloseSubmissions).set({ reconciliationStatus, sourceSnapshotAt: new Date(source.snapshotAt) }).where(eq(salesAuditCloseSubmissions.id, session.submission.id));
      if (!matches) await tx.insert(salesAuditLogs).values({ sessionId, action: "SOURCE_TOTALS_MISMATCH", actorId: session.submission?.submittedBy ?? session.openedBy, details: { local, source: sourceTotals, negativeExpectedMethods: methods.filter((method) => session.expectedTotals[method].expectedMinor < 0), snapshotAt: source.snapshotAt } });
      else if (session.reconciliationStatus !== "MATCHED") await tx.insert(salesAuditLogs).values({ sessionId, action: "RECONCILIATION_MATCHED", actorId: session.submission?.submittedBy ?? session.openedBy, details: { snapshotAt: source.snapshotAt } });
    });
    return { reconciliationStatus, sourceSnapshotAt: source.snapshotAt, local, source: { saleCount: source.saleCount, returnCount: source.returnCount, tenderTotals: source.tenderTotals } };
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode < 500) throw error;
    await db.transaction(async (tx) => {
      await tx.update(salesAuditSessions).set({ status: session.status === "APPROVED" ? "APPROVED" : "EXCEPTION", reconciliationStatus: "UNAVAILABLE", lastReconciliationDetails: { message: "Retail Sales totals are unavailable. Retry reconciliation before approval." }, updatedAt: new Date() }).where(eq(salesAuditSessions.id, sessionId));
      if (session.submission) await tx.update(salesAuditCloseSubmissions).set({ reconciliationStatus: "UNAVAILABLE" }).where(eq(salesAuditCloseSubmissions.id, session.submission.id));
      await tx.insert(salesAuditLogs).values({ sessionId, action: "RECONCILIATION_UNAVAILABLE", actorId: session.submission?.submittedBy ?? session.openedBy, details: { message: error.message } });
    });
    return { reconciliationStatus: "UNAVAILABLE", message: "Retail Sales totals are unavailable. Retry reconciliation before approval." };
  }
}

sessionRouter.get("/registers", async (_req, res) => res.json({ data: await listRetailRegisters() }));

sessionRouter.post("/sessions", async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = idemFrom(req.header("Idempotency-Key"));
  const input = z.object({ registerId: uuid, openingFloatMinor: z.number().int().nonnegative().max(2147483647) }).parse(req.body);
  const requestHash = hash({ actorId, ...input });
  const existing = await db.select().from(salesAuditSessions).where(eq(salesAuditSessions.openIdempotencyKey, idempotencyKey)).limit(1);
  if (existing[0]) {
    if (existing[0].openRequestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different session data", 409);
    return res.json({ data: await detail(existing[0].id) });
  }
  const registers = await listRetailRegisters();
  const register = registers.find((item) => item.id === input.registerId);
  if (!register) throw new AppError("Active Retail Sales register not found", 404);
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${register.id}))`);
      const [duplicate] = await tx.select().from(salesAuditSessions).where(eq(salesAuditSessions.openIdempotencyKey, idempotencyKey)).limit(1);
      if (duplicate) {
        if (duplicate.openRequestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different session data", 409);
        return { sessionId: duplicate.id, replayed: true };
      }
      const [active] = await tx.select().from(salesAuditSessions).where(and(
        eq(salesAuditSessions.registerId, register.id),
        or(eq(salesAuditSessions.status, "OPEN"), eq(salesAuditSessions.status, "SUBMITTED"), eq(salesAuditSessions.status, "EXCEPTION"), eq(salesAuditSessions.status, "REJECTED")),
      )).limit(1);
      if (active) throw new AppError("This register already has an active session", 409);
      const [session] = await tx.insert(salesAuditSessions).values({ registerId: register.id, locationId: register.inventoryLocationId, registerCode: register.code, registerName: register.name, openedBy: actorId, openingFloatMinor: input.openingFloatMinor, openIdempotencyKey: idempotencyKey, openRequestHash: requestHash }).returning();
      if (!session) throw new Error("Register session could not be opened");
      await tx.insert(salesAuditLogs).values({ sessionId: session.id, action: "SESSION_OPENED", actorId, details: { registerId: register.id, openingFloatMinor: input.openingFloatMinor, requestHash, idempotencyKey } });
      return { sessionId: session.id, replayed: false };
    });
    return res.status(outcome.replayed ? 200 : 201).json({ data: await detail(outcome.sessionId) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new AppError("This register already has an active session", 409);
    throw error;
  }
});

sessionRouter.get("/sessions", async (req, res) => {
  const filter = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), registerId: uuid.optional(), status: z.enum(["OPEN", "SUBMITTED", "APPROVED", "REJECTED", "EXCEPTION"]).optional() }).parse(req.query);
  const predicates = [];
  if (filter.registerId) predicates.push(eq(salesAuditSessions.registerId, filter.registerId));
  if (filter.status) predicates.push(eq(salesAuditSessions.status, filter.status));
  const where = predicates.length ? and(...predicates) : undefined;
  const [data, [countRow]] = await Promise.all([
    db.select().from(salesAuditSessions).where(where).orderBy(desc(salesAuditSessions.openedAt)).limit(filter.limit).offset((filter.page - 1) * filter.limit),
    db.select({ total: count() }).from(salesAuditSessions).where(where),
  ]);
  const total = Number(countRow?.total ?? 0);
  return res.json({ data, pagination: { page: filter.page, limit: filter.limit, total, totalPages: Math.ceil(total / filter.limit) } });
});

sessionRouter.get("/sessions/:id", async (req, res) => res.json({ data: await detail(uuid.parse(req.params.id)) }));

sessionRouter.get("/sessions/:id/transactions", async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  const filter = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
  const [session] = await db.select().from(salesAuditSessions).where(eq(salesAuditSessions.id, sessionId)).limit(1);
  if (!session) throw new AppError("Register session not found", 404);
  const end = session.closedAt ?? new Date();
  const where = and(eq(salesAuditTransactions.registerId, session.registerId), gte(salesAuditTransactions.occurredAt, session.openedAt), lt(salesAuditTransactions.occurredAt, end));
  const [transactions, [totalRow]] = await Promise.all([
    db.select().from(salesAuditTransactions).where(where).orderBy(salesAuditTransactions.occurredAt).limit(filter.limit).offset((filter.page - 1) * filter.limit),
    db.select({ total: count() }).from(salesAuditTransactions).where(where),
  ]);
  const tenders = transactions.length ? await db.select().from(salesAuditTransactionTenders).where(inArray(salesAuditTransactionTenders.transactionRecordId, transactions.map((transaction) => transaction.id))) : [];
  const tenderMap = new Map<string, typeof tenders>();
  for (const tender of tenders) tenderMap.set(tender.transactionRecordId, [...(tenderMap.get(tender.transactionRecordId) ?? []), tender]);
  const total = Number(totalRow?.total ?? 0);
  return res.json({ data: transactions.map((transaction) => ({ ...transaction, tenders: tenderMap.get(transaction.id) ?? [] })), pagination: { page: filter.page, limit: filter.limit, total, totalPages: Math.ceil(total / filter.limit) } });
});


sessionRouter.post("/sessions/:id/submit", async (req, res) => {
  const sessionId = uuid.parse(req.params.id); const actorId = actorFrom(req.header("x-actor-id")); const idempotencyKey = idemFrom(req.header("Idempotency-Key"));
  const input = z.object({ countedTotals: z.array(z.object({ method: z.enum(methods), amountMinor: z.number().int().nonnegative().max(2147483647) })).length(3), varianceExplanations: z.record(z.string(), z.string().trim().max(500)) }).parse(req.body);
  if (new Set(input.countedTotals.map((row) => row.method)).size !== methods.length) throw new AppError("Provide exactly one counted amount for each tender method", 400);
  const requestHash = hash({ sessionId, actorId, ...input });
  const prior = await db.select().from(salesAuditCloseSubmissions).where(eq(salesAuditCloseSubmissions.idempotencyKey, idempotencyKey)).limit(1);
  if (prior[0]) {
    if (prior[0].requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different close data", 409);
    return res.json({ data: await detail(sessionId) });
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
    const [duplicate] = await tx.select().from(salesAuditCloseSubmissions).where(eq(salesAuditCloseSubmissions.idempotencyKey, idempotencyKey)).limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different close data", 409);
      return { duplicate: true as const };
    }
    const [session] = await tx.select().from(salesAuditSessions).where(eq(salesAuditSessions.id, sessionId)).for("update").limit(1);
    if (!session) throw new AppError("Register session not found", 404);
    if (!["OPEN", "REJECTED", "EXCEPTION"].includes(session.status)) throw new AppError("This session cannot accept a close submission", 409);
    const before = await detail(sessionId);
    const submittedCounts = Object.fromEntries(input.countedTotals.map((row) => [row.method, row.amountMinor]));
    const missingReasons = methods.filter((method) => submittedCounts[method]! - before.expectedTotals[method].expectedMinor !== 0 && !input.varianceExplanations[method]?.trim());
    if (missingReasons.length) throw new AppError("A variance explanation is required for every non-zero tender variance", 400, missingReasons.map((method) => ({ field: `varianceExplanations.${method}`, message: `Explain the ${method.toLowerCase().replace("_", " ")} variance.` })));
    const closedAt = session.closedAt ?? new Date();
    await tx.update(salesAuditSessions).set({ status: "SUBMITTED", closedAt, reconciliationStatus: "PENDING", updatedAt: new Date() }).where(eq(salesAuditSessions.id, sessionId));
    const rows = await tx.select({ submissionNumber: salesAuditCloseSubmissions.submissionNumber }).from(salesAuditCloseSubmissions).where(eq(salesAuditCloseSubmissions.sessionId, sessionId)).orderBy(desc(salesAuditCloseSubmissions.submissionNumber)).limit(1);
    const submissionNumber = (rows[0]?.submissionNumber ?? 0) + 1;
    const counted = Object.fromEntries(input.countedTotals.map((row) => [row.method, row.amountMinor]));
    const [submission] = await tx.insert(salesAuditCloseSubmissions).values({ sessionId, submissionNumber, idempotencyKey, requestHash, submittedBy: actorId, closedAt, countedTotals: counted, varianceExplanations: input.varianceExplanations }).returning();
    if (!submission) throw new Error("Close submission was not recorded");
    await tx.insert(salesAuditLogs).values({ sessionId, action: "CLOSE_SUBMITTED", actorId, details: { submissionId: submission.id, submissionNumber } });
    return { duplicate: false as const, submission };
  });
  if (result.duplicate) return res.json({ data: await detail(sessionId) });
  await compareWithRetail(sessionId);
  return res.status(201).json({ data: await detail(sessionId) });
});

sessionRouter.post("/sessions/:id/reconcile", async (req, res) => {
  const sessionId = uuid.parse(req.params.id); actorFrom(req.header("x-actor-id"));
  await compareWithRetail(sessionId);
  return res.json({ data: await detail(sessionId) });
});

sessionRouter.post("/sessions/:id/approve", async (req, res) => {
  const sessionId = uuid.parse(req.params.id); const actorId = actorFrom(req.header("x-actor-id"));
  const input = z.object({}).parse(req.body ?? {});
  void input;
  const priorSession = await detail(sessionId);
  if (priorSession.status === "APPROVED") {
    const priorApproval = priorSession.decisions.at(-1);
    if (priorApproval?.action === "APPROVED" && priorApproval.actorId === actorId) return res.json({ data: priorSession });
    throw new AppError("This close has already been approved", 409);
  }
  await compareWithRetail(sessionId);
  const session = await detail(sessionId);
  if (session.status !== "SUBMITTED" || session.reconciliationStatus !== "MATCHED" || !session.submission || session.submission.reconciliationStatus !== "MATCHED") throw new AppError("This close is not reconciled and ready for approval", 409, [{ field: "status", message: "Resolve event synchronization or source-total differences, then reconcile again." }]);
  if (session.submission.submittedBy === actorId) throw new AppError("A different manager must approve this close", 403);
  const decision = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(salesAuditSessions).where(eq(salesAuditSessions.id, sessionId)).for("update").limit(1);
    if (!locked || locked.status !== "SUBMITTED") throw new AppError("Session status changed before approval", 409);
    const [created] = await tx.insert(salesAuditDecisions).values({ sessionId, submissionId: session.submission!.id, action: "APPROVED", actorId }).returning();
    await tx.update(salesAuditSessions).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(salesAuditSessions.id, sessionId));
    await tx.insert(salesAuditLogs).values({ sessionId, action: "CLOSE_APPROVED", actorId, details: { submissionId: session.submission!.id } });
    return created;
  });
  return res.status(201).json({ data: { ...(await detail(sessionId)), decision } });
});

sessionRouter.post("/sessions/:id/reject", async (req, res) => {
  const sessionId = uuid.parse(req.params.id); const actorId = actorFrom(req.header("x-actor-id"));
  const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
  const session = await detail(sessionId);
  if (session.status === "REJECTED") {
    const priorRejection = session.decisions.at(-1);
    if (priorRejection?.action === "REJECTED" && priorRejection.actorId === actorId && priorRejection.reason === reason) return res.json({ data: session });
    throw new AppError("This close has already been rejected", 409);
  }
  if (!["SUBMITTED", "EXCEPTION"].includes(session.status) || !session.submission) throw new AppError("This session has no close submission to reject", 409);
  if (session.submission.submittedBy === actorId) throw new AppError("A different manager must review this close", 403);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(salesAuditSessions).where(eq(salesAuditSessions.id, sessionId)).for("update").limit(1);
    if (!locked || !["SUBMITTED", "EXCEPTION"].includes(locked.status)) throw new AppError("Session status changed before rejection", 409);
    await tx.insert(salesAuditDecisions).values({ sessionId, submissionId: session.submission!.id, action: "REJECTED", actorId, reason });
    await tx.update(salesAuditSessions).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(salesAuditSessions.id, sessionId));
    await tx.insert(salesAuditLogs).values({ sessionId, action: "CLOSE_REJECTED", actorId, details: { submissionId: session.submission!.id, reason } });
  });
  return res.status(201).json({ data: await detail(sessionId) });
});

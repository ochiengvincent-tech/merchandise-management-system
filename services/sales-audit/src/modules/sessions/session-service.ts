import { createHash } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import {
  getRetailTotals,
  type RetailTotals,
} from "../../clients/retail-sales-client.js";
import {
  approveSession,
  findAllSessionTransactions,
  findLatestSessionSubmission,
  findSessionById,
  findSessionDecisions,
  findSessions,
  findSubmissionByIdempotencyKey,
  findTendersByTransactionIds,
  listSessionTransactions,
  openSession,
  rejectSession,
  findSessionByOpenKey,
  saveReconciliation,
  saveReconciliationUnavailable,
  submitSessionClose,
} from "./session-repository.js";
import { listRetailRegisters } from "../../clients/retail-sales-client.js";
export const getRetailRegisters = listRetailRegisters;

const methods = ["CASH", "CARD", "GIFT_CARD"] as const;
type TotalsByMethod = Record<
  (typeof methods)[number],
  {
    saleMinor: number;
    refundMinor: number;
    openingMinor: number;
    expectedMinor: number;
    countedMinor: number | null;
    varianceMinor: number | null;
  }
>;

export async function getSessionDetail(sessionId: string) {
  const [session] = await findSessionById(sessionId);
  if (!session) throw new AppError("Register session not found", 404);
  const transactions = await findAllSessionTransactions(
    session.registerId,
    session.openedAt,
    session.closedAt,
  );
  const tenderRows = await findTendersByTransactionIds(
    transactions.map((item) => item.id),
  );
  const latestRows = await findLatestSessionSubmission(sessionId);
  const submission = latestRows[0] ?? null;
  const counted = (submission?.countedTotals ?? {}) as Partial<
    Record<(typeof methods)[number], number>
  >;
  const sums: TotalsByMethod = {
    CASH: {
      saleMinor: 0,
      refundMinor: 0,
      openingMinor: session.openingFloatMinor,
      expectedMinor: 0,
      countedMinor: null,
      varianceMinor: null,
    },
    CARD: {
      saleMinor: 0,
      refundMinor: 0,
      openingMinor: 0,
      expectedMinor: 0,
      countedMinor: null,
      varianceMinor: null,
    },
    GIFT_CARD: {
      saleMinor: 0,
      refundMinor: 0,
      openingMinor: 0,
      expectedMinor: 0,
      countedMinor: null,
      varianceMinor: null,
    },
  };
  const tenderByTransaction = new Map<string, typeof tenderRows>();
  for (const tender of tenderRows)
    tenderByTransaction.set(tender.transactionRecordId, [
      ...(tenderByTransaction.get(tender.transactionRecordId) ?? []),
      tender,
    ]);
  for (const transaction of transactions)
    for (const tender of tenderByTransaction.get(transaction.id) ?? []) {
      const amount = sums[tender.method as (typeof methods)[number]];
      if (!amount) continue;
      if (transaction.direction === "SALE")
        amount.saleMinor += tender.amountMinor;
      else amount.refundMinor += tender.amountMinor;
    }
  for (const method of methods) {
    const row = sums[method];
    row.expectedMinor = row.openingMinor + row.saleMinor - row.refundMinor;
    if (submission) {
      row.countedMinor = counted[method] ?? 0;
      row.varianceMinor = row.countedMinor - row.expectedMinor;
    }
  }
  const decisions = await findSessionDecisions(sessionId);
  return {
    ...session,
    expectedTotals: sums,
    transactionCount: transactions.length,
    transactions: transactions.map((item) => ({
      ...item,
      tenders: tenderByTransaction.get(item.id) ?? [],
    })),
    submission,
    decisions,
  };
}

function localSnapshot(session: Awaited<ReturnType<typeof getSessionDetail>>) {
  const tenderTotals: RetailTotals["tenderTotals"] = {
    CASH: { saleMinor: 0, refundMinor: 0 },
    CARD: { saleMinor: 0, refundMinor: 0 },
    GIFT_CARD: { saleMinor: 0, refundMinor: 0 },
  };
  let saleCount = 0;
  let returnCount = 0;
  for (const transaction of session.transactions) {
    if (transaction.direction === "SALE") saleCount += 1;
    else returnCount += 1;
    for (const tender of transaction.tenders) {
      const row = tenderTotals[tender.method];
      if (row)
        row[transaction.direction === "SALE" ? "saleMinor" : "refundMinor"] +=
          tender.amountMinor;
    }
  }
  return { saleCount, returnCount, tenderTotals };
}

export async function reconcileWithRetail(sessionId: string) {
  const session = await getSessionDetail(sessionId);
  if (!session.closedAt)
    throw new AppError("Session has not been submitted", 409);
  try {
    const source = await getRetailTotals(
      session.registerId,
      session.openedAt,
      session.closedAt,
    );
    const local = localSnapshot(session);
    const sourceTotals = {
      saleCount: source.saleCount,
      returnCount: source.returnCount,
      tenderTotals: source.tenderTotals,
    };
    const matches =
      local.saleCount === source.saleCount &&
      local.returnCount === source.returnCount &&
      methods.every(
        (method) =>
          local.tenderTotals[method].saleMinor ===
            source.tenderTotals[method]?.saleMinor &&
          local.tenderTotals[method].refundMinor ===
            source.tenderTotals[method]?.refundMinor,
      ) &&
      methods.every(
        (method) => session.expectedTotals[method].expectedMinor >= 0,
      );
    const reconciliationStatus = matches ? "MATCHED" : "MISMATCH";
    const status =
      session.status === "APPROVED" ||
      session.status === "EXCEPTION" ||
      session.status === "REJECTED"
        ? session.status
        : matches
          ? "SUBMITTED"
          : "EXCEPTION";
    const details = {
      local,
      source: sourceTotals,
      negativeExpectedMethods: methods.filter(
        (method) => session.expectedTotals[method].expectedMinor < 0,
      ),
      snapshotAt: source.snapshotAt,
    };
    await saveReconciliation({
      sessionId,
      session,
      submissionId: session.submission?.id ?? null,
      status,
      reconciliationStatus,
      snapshotAt: source.snapshotAt,
      details,
      actorId: session.submission?.submittedBy ?? session.openedBy,
      matches,
    });
    return {
      reconciliationStatus,
      sourceSnapshotAt: source.snapshotAt,
      local,
      source: {
        saleCount: source.saleCount,
        returnCount: source.returnCount,
        tenderTotals: source.tenderTotals,
      },
    };
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode < 500) throw error;
    const message =
      "Retail Sales totals are unavailable. Retry reconciliation before approval.";
    await saveReconciliationUnavailable({
      sessionId,
      session,
      submissionId: session.submission?.id ?? null,
      actorId: session.submission?.submittedBy ?? session.openedBy,
      message,
    });
    return { reconciliationStatus: "UNAVAILABLE", message };
  }
}

export const getRegisterSessions = findSessions;
export const getCloseSubmissionByKey = findSubmissionByIdempotencyKey;

const requestHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function openRegisterSession(input: {
  registerId: string;
  openingFloatMinor: number;
  actorId: string;
  idempotencyKey: string;
}) {
  const hash = requestHash({ actorId: input.actorId, registerId: input.registerId, openingFloatMinor: input.openingFloatMinor });
  const [existing] = await findSessionByOpenKey(input.idempotencyKey);
  if (existing) {
    if (existing.openRequestHash !== hash) throw new AppError("Idempotency-Key was already used with different session data", 409);
    return { sessionId: existing.id, replayed: true };
  }
  const register = (await listRetailRegisters()).find((item) => item.id === input.registerId);
  if (!register) throw new AppError("Active Retail Sales register not found", 404);
  try {
    return await openSession({ idempotencyKey: input.idempotencyKey, requestHash: hash, register, actorId: input.actorId, openingFloatMinor: input.openingFloatMinor });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new AppError("This register already has an active session", 409);
    throw error;
  }
}

export async function submitCloseSession(input: {
  sessionId: string;
  actorId: string;
  idempotencyKey: string;
  countedTotals: Array<{ method: (typeof methods)[number]; amountMinor: number }>;
  varianceExplanations: Record<string, string>;
}) {
  if (new Set(input.countedTotals.map((row) => row.method)).size !== methods.length)
    throw new AppError("Provide exactly one counted amount for each tender method", 400);
  const requestHash = requestHashFor({
    sessionId: input.sessionId,
    actorId: input.actorId,
    countedTotals: input.countedTotals,
    varianceExplanations: input.varianceExplanations,
  });
  const [existing] = await findSubmissionByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new AppError("Idempotency-Key was already used with different close data", 409);
    return { duplicate: true };
  }
  const countedTotals = Object.fromEntries(input.countedTotals.map((row) => [row.method, row.amountMinor]));
  const result = await submitSessionClose({ ...input, requestHash, countedTotals }, async () => {
    await validateCloseSubmission(input.sessionId, countedTotals, input.varianceExplanations);
  });
  if (result.duplicate) return result;
  await reconcileWithRetail(input.sessionId);
  return result;
}

function requestHashFor(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function approveCloseSession(sessionId: string, actorId: string) {
  const current = await getSessionDetail(sessionId);
  if (current.status === "APPROVED") {
    const prior = current.decisions.at(-1);
    if (prior?.action === "APPROVED" && prior.actorId === actorId) return { replayed: true, decision: prior };
    throw new AppError("This close has already been approved", 409);
  }
  await reconcileWithRetail(sessionId);
  const session = await getSessionDetail(sessionId);
  if (session.status !== "SUBMITTED" || session.reconciliationStatus !== "MATCHED" || !session.submission || session.submission.reconciliationStatus !== "MATCHED") throw new AppError("This close is not reconciled and ready for approval", 409, [{ field: "status", message: "Resolve event synchronization or source-total differences, then reconcile again." }]);
  if (session.submission.submittedBy === actorId) throw new AppError("A different manager must approve this close", 403);
  const decision = await approveSession({ sessionId, submissionId: session.submission.id, actorId });
  return { replayed: false, decision };
}

export async function rejectCloseSession(sessionId: string, actorId: string, reason: string) {
  const session = await getSessionDetail(sessionId);
  if (session.status === "REJECTED") {
    const prior = session.decisions.at(-1);
    if (prior?.action === "REJECTED" && prior.actorId === actorId && prior.reason === reason) return { replayed: true };
    throw new AppError("This close has already been rejected", 409);
  }
  if (!["SUBMITTED", "EXCEPTION"].includes(session.status) || !session.submission) throw new AppError("This session has no close submission to reject", 409);
  if (session.submission.submittedBy === actorId) throw new AppError("A different manager must review this close", 403);
  await rejectSession({ sessionId, submissionId: session.submission.id, actorId, reason });
  return { replayed: false };
}

export async function getSessionTransactions(
  sessionId: string,
  page: number,
  limit: number,
) {
  const [session] = await findSessionById(sessionId);
  if (!session) throw new AppError("Register session not found", 404);
  const [transactions, [row]] = await listSessionTransactions(
    session.registerId,
    session.openedAt,
    session.closedAt,
    page,
    limit,
  );
  const tenders = await findTendersByTransactionIds(
    transactions.map((transaction) => transaction.id),
  );
  const tenderMap = new Map<string, typeof tenders>();
  for (const tender of tenders)
    tenderMap.set(tender.transactionRecordId, [
      ...(tenderMap.get(tender.transactionRecordId) ?? []),
      tender,
    ]);
  const total = Number(row?.total ?? 0);
  return {
    data: transactions.map((transaction) => ({
      ...transaction,
      tenders: tenderMap.get(transaction.id) ?? [],
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function validateCloseSubmission(
  sessionId: string,
  countedTotals: Record<string, number>,
  varianceExplanations: Record<string, string>,
) {
  const before = await getSessionDetail(sessionId);
  const missingReasons = methods.filter(
    (method) =>
      countedTotals[method]! - before.expectedTotals[method].expectedMinor !==
        0 && !varianceExplanations[method]?.trim(),
  );
  if (missingReasons.length)
    throw new AppError(
      "A variance explanation is required for every non-zero tender variance",
      400,
      missingReasons.map((method) => ({
        field: `varianceExplanations.${method}`,
        message: `Explain the ${method.toLowerCase().replace("_", " ")} variance.`,
      })),
    );
}

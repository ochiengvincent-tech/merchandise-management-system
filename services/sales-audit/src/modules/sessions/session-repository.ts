import { and, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  salesAuditCloseSubmissions,
  salesAuditDecisions,
  salesAuditLogs,
  salesAuditSessions,
  salesAuditTransactionTenders,
  salesAuditTransactions,
} from "../../db/schema/sales-audit.js";
import { AppError } from "../../errors/app-error.js";

export const findSessionById = (sessionId: string) =>
  db
    .select()
    .from(salesAuditSessions)
    .where(eq(salesAuditSessions.id, sessionId))
    .limit(1);

export const listSessionTransactions = (
  registerId: string,
  openedAt: Date,
  closedAt: Date | null,
  page: number,
  limit: number,
) => {
  const end = closedAt ?? new Date();
  const where = and(
    eq(salesAuditTransactions.registerId, registerId),
    gte(salesAuditTransactions.occurredAt, openedAt),
    lt(salesAuditTransactions.occurredAt, end),
  );
  return Promise.all([
    db
      .select()
      .from(salesAuditTransactions)
      .where(where)
      .orderBy(salesAuditTransactions.occurredAt)
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(salesAuditTransactions).where(where),
  ]);
};

export const findAllSessionTransactions = (
  registerId: string,
  openedAt: Date,
  closedAt: Date | null,
) => {
  const end = closedAt ?? new Date();
  return db
    .select()
    .from(salesAuditTransactions)
    .where(
      and(
        eq(salesAuditTransactions.registerId, registerId),
        gte(salesAuditTransactions.occurredAt, openedAt),
        lt(salesAuditTransactions.occurredAt, end),
      ),
    )
    .orderBy(salesAuditTransactions.occurredAt);
};

export const findTendersByTransactionIds = (transactionIds: string[]) =>
  transactionIds.length
    ? db
        .select()
        .from(salesAuditTransactionTenders)
        .where(
          inArray(
            salesAuditTransactionTenders.transactionRecordId,
            transactionIds,
          ),
        )
    : Promise.resolve([]);

export const findLatestSessionSubmission = (sessionId: string) =>
  db
    .select()
    .from(salesAuditCloseSubmissions)
    .where(eq(salesAuditCloseSubmissions.sessionId, sessionId))
    .orderBy(desc(salesAuditCloseSubmissions.submissionNumber))
    .limit(1);

export const findSessionDecisions = (sessionId: string) =>
  db
    .select()
    .from(salesAuditDecisions)
    .where(eq(salesAuditDecisions.sessionId, sessionId))
    .orderBy(salesAuditDecisions.createdAt);

export const findSessionByOpenKey = (idempotencyKey: string) =>
  db
    .select()
    .from(salesAuditSessions)
    .where(eq(salesAuditSessions.openIdempotencyKey, idempotencyKey))
    .limit(1);

export const openSession = (input: {
  idempotencyKey: string;
  requestHash: string;
  register: {
    id: string;
    inventoryLocationId: string;
    code: string;
    name: string;
  };
  actorId: string;
  openingFloatMinor: number;
}) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.register.id}))`,
    );
    const [duplicate] = await tx
      .select()
      .from(salesAuditSessions)
      .where(eq(salesAuditSessions.openIdempotencyKey, input.idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (duplicate.openRequestHash !== input.requestHash)
        throw new AppError(
          "Idempotency-Key was already used with different session data",
          409,
        );
      return { sessionId: duplicate.id, replayed: true };
    }
    const [active] = await tx
      .select()
      .from(salesAuditSessions)
      .where(
        and(
          eq(salesAuditSessions.registerId, input.register.id),
          or(
            eq(salesAuditSessions.status, "OPEN"),
            eq(salesAuditSessions.status, "SUBMITTED"),
            eq(salesAuditSessions.status, "EXCEPTION"),
            eq(salesAuditSessions.status, "REJECTED"),
          ),
        ),
      )
      .limit(1);
    if (active)
      throw new AppError("This register already has an active session", 409);
    const [session] = await tx
      .insert(salesAuditSessions)
      .values({
        registerId: input.register.id,
        locationId: input.register.inventoryLocationId,
        registerCode: input.register.code,
        registerName: input.register.name,
        openedBy: input.actorId,
        openingFloatMinor: input.openingFloatMinor,
        openIdempotencyKey: input.idempotencyKey,
        openRequestHash: input.requestHash,
      })
      .returning();
    if (!session) throw new Error("Register session could not be opened");
    await tx
      .insert(salesAuditLogs)
      .values({
        sessionId: session.id,
        action: "SESSION_OPENED",
        actorId: input.actorId,
        details: {
          registerId: input.register.id,
          openingFloatMinor: input.openingFloatMinor,
          requestHash: input.requestHash,
          idempotencyKey: input.idempotencyKey,
        },
      });
    return { sessionId: session.id, replayed: false };
  });

export const findSessions = async (filters: {
  page: number;
  limit: number;
  registerId?: string;
  status?: string;
}) => {
  const predicates = [];
  if (filters.registerId)
    predicates.push(eq(salesAuditSessions.registerId, filters.registerId));
  if (filters.status)
    predicates.push(eq(salesAuditSessions.status, filters.status));
  const where = predicates.length ? and(...predicates) : undefined;
  const [data, [countRow]] = await Promise.all([
    db
      .select()
      .from(salesAuditSessions)
      .where(where)
      .orderBy(desc(salesAuditSessions.openedAt))
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit),
    db.select({ total: count() }).from(salesAuditSessions).where(where),
  ]);
  return { data, total: Number(countRow?.total ?? 0) };
};

export const findSubmissionByIdempotencyKey = (idempotencyKey: string) =>
  db
    .select()
    .from(salesAuditCloseSubmissions)
    .where(eq(salesAuditCloseSubmissions.idempotencyKey, idempotencyKey))
    .limit(1);

export const submitSessionClose = (
  input: {
    sessionId: string;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
    countedTotals: Record<string, number>;
    varianceExplanations: Record<string, string>;
  },
  validate: (session: typeof salesAuditSessions.$inferSelect) => Promise<void>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`,
    );
    const [duplicate] = await tx
      .select()
      .from(salesAuditCloseSubmissions)
      .where(
        eq(salesAuditCloseSubmissions.idempotencyKey, input.idempotencyKey),
      )
      .limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== input.requestHash)
        throw new AppError(
          "Idempotency-Key was already used with different close data",
          409,
        );
      return { duplicate: true as const, submission: duplicate };
    }
    const [session] = await tx
      .select()
      .from(salesAuditSessions)
      .where(eq(salesAuditSessions.id, input.sessionId))
      .for("update")
      .limit(1);
    if (!session) throw new AppError("Register session not found", 404);
    if (!["OPEN", "REJECTED", "EXCEPTION"].includes(session.status))
      throw new AppError("This session cannot accept a close submission", 409);
    await validate(session);
    const closedAt = session.closedAt ?? new Date();
    await tx
      .update(salesAuditSessions)
      .set({
        status: "SUBMITTED",
        closedAt,
        reconciliationStatus: "PENDING",
        updatedAt: new Date(),
      })
      .where(eq(salesAuditSessions.id, input.sessionId));
    const rows = await tx
      .select({ submissionNumber: salesAuditCloseSubmissions.submissionNumber })
      .from(salesAuditCloseSubmissions)
      .where(eq(salesAuditCloseSubmissions.sessionId, input.sessionId))
      .orderBy(desc(salesAuditCloseSubmissions.submissionNumber))
      .limit(1);
    const submissionNumber = (rows[0]?.submissionNumber ?? 0) + 1;
    const [submission] = await tx
      .insert(salesAuditCloseSubmissions)
      .values({
        sessionId: input.sessionId,
        submissionNumber,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        submittedBy: input.actorId,
        closedAt,
        countedTotals: input.countedTotals,
        varianceExplanations: input.varianceExplanations,
      })
      .returning();
    if (!submission) throw new Error("Close submission was not recorded");
    await tx
      .insert(salesAuditLogs)
      .values({
        sessionId: input.sessionId,
        action: "CLOSE_SUBMITTED",
        actorId: input.actorId,
        details: { submissionId: submission.id, submissionNumber },
      });
    return { duplicate: false as const, submission };
  });

export const saveReconciliation = (input: {
  sessionId: string;
  session: typeof salesAuditSessions.$inferSelect;
  submissionId: string | null;
  status: string;
  reconciliationStatus: string;
  snapshotAt: string;
  details: unknown;
  actorId: string;
  matches: boolean;
}) =>
  db.transaction(async (tx) => {
    await tx
      .update(salesAuditSessions)
      .set({
        status: input.status,
        reconciliationStatus: input.reconciliationStatus,
        lastSnapshotAt: new Date(input.snapshotAt),
        lastReconciliationDetails: input.details,
        updatedAt: new Date(),
      })
      .where(eq(salesAuditSessions.id, input.sessionId));
    if (input.submissionId)
      await tx
        .update(salesAuditCloseSubmissions)
        .set({
          reconciliationStatus: input.reconciliationStatus,
          sourceSnapshotAt: new Date(input.snapshotAt),
        })
        .where(eq(salesAuditCloseSubmissions.id, input.submissionId));
    if (!input.matches)
      await tx
        .insert(salesAuditLogs)
        .values({
          sessionId: input.sessionId,
          action: "SOURCE_TOTALS_MISMATCH",
          actorId: input.actorId,
          details: input.details,
        });
    else if (input.session.reconciliationStatus !== "MATCHED")
      await tx
        .insert(salesAuditLogs)
        .values({
          sessionId: input.sessionId,
          action: "RECONCILIATION_MATCHED",
          actorId: input.actorId,
          details: { snapshotAt: input.snapshotAt },
        });
  });

export const saveReconciliationUnavailable = (input: {
  sessionId: string;
  session: typeof salesAuditSessions.$inferSelect;
  submissionId: string | null;
  actorId: string;
  message: string;
}) =>
  db.transaction(async (tx) => {
    await tx
      .update(salesAuditSessions)
      .set({
        status: input.session.status === "APPROVED" ? "APPROVED" : "EXCEPTION",
        reconciliationStatus: "UNAVAILABLE",
        lastReconciliationDetails: { message: input.message },
        updatedAt: new Date(),
      })
      .where(eq(salesAuditSessions.id, input.sessionId));
    if (input.submissionId)
      await tx
        .update(salesAuditCloseSubmissions)
        .set({ reconciliationStatus: "UNAVAILABLE" })
        .where(eq(salesAuditCloseSubmissions.id, input.submissionId));
    await tx
      .insert(salesAuditLogs)
      .values({
        sessionId: input.sessionId,
        action: "RECONCILIATION_UNAVAILABLE",
        actorId: input.actorId,
        details: { message: input.message },
      });
  });

export const approveSession = (input: {
  sessionId: string;
  submissionId: string;
  actorId: string;
}) =>
  db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(salesAuditSessions)
      .where(eq(salesAuditSessions.id, input.sessionId))
      .for("update")
      .limit(1);
    if (!locked || locked.status !== "SUBMITTED")
      throw new AppError("Session status changed before approval", 409);
    const [created] = await tx
      .insert(salesAuditDecisions)
      .values({
        sessionId: input.sessionId,
        submissionId: input.submissionId,
        action: "APPROVED",
        actorId: input.actorId,
      })
      .returning();
    await tx
      .update(salesAuditSessions)
      .set({ status: "APPROVED", updatedAt: new Date() })
      .where(eq(salesAuditSessions.id, input.sessionId));
    await tx
      .insert(salesAuditLogs)
      .values({
        sessionId: input.sessionId,
        action: "CLOSE_APPROVED",
        actorId: input.actorId,
        details: { submissionId: input.submissionId },
      });
    return created;
  });

export const rejectSession = (input: {
  sessionId: string;
  submissionId: string;
  actorId: string;
  reason: string;
}) =>
  db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(salesAuditSessions)
      .where(eq(salesAuditSessions.id, input.sessionId))
      .for("update")
      .limit(1);
    if (!locked || !["SUBMITTED", "EXCEPTION"].includes(locked.status))
      throw new AppError("Session status changed before rejection", 409);
    await tx
      .insert(salesAuditDecisions)
      .values({
        sessionId: input.sessionId,
        submissionId: input.submissionId,
        action: "REJECTED",
        actorId: input.actorId,
        reason: input.reason,
      });
    await tx
      .update(salesAuditSessions)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(salesAuditSessions.id, input.sessionId));
    await tx
      .insert(salesAuditLogs)
      .values({
        sessionId: input.sessionId,
        action: "CLOSE_REJECTED",
        actorId: input.actorId,
        details: { submissionId: input.submissionId, reason: input.reason },
      });
  });

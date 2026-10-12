import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  financialAccounts,
  financialAuditLogs,
  financialJournalLines,
  financialJournals,
  financialPeriods,
  financialProcessedEvents,
  financialPostingMappings,
} from "../../db/schema/financials.js";
import { AppError } from "../../errors/app-error.js";
import type { JournalLineInput, PostingOperations } from "./posting-contract.js";

export const findAccounts = () =>
  db.select().from(financialAccounts).orderBy(asc(financialAccounts.code));

export const createAccount = (
  input: typeof financialAccounts.$inferInsert,
  actorId: string,
) =>
  db.transaction(async (tx) => {
    const [created] = await tx
      .insert(financialAccounts)
      .values(input)
      .returning();
    if (!created) throw new Error("Account was not created");
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "ACCOUNT_CREATED",
        actorId,
        recordType: "ACCOUNT",
        recordId: created.id,
        details: {
          code: created.code,
          name: created.name,
          accountType: created.accountType,
          normalBalance: created.normalBalance,
        },
      });
    return created;
  });

export const findPostingMappings = () =>
  db
    .select({
      mappingKey: financialPostingMappings.mappingKey,
      accountCode: financialPostingMappings.accountCode,
      accountName: financialAccounts.name,
      updatedBy: financialPostingMappings.updatedBy,
      updatedAt: financialPostingMappings.updatedAt,
    })
    .from(financialPostingMappings)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.code, financialPostingMappings.accountCode),
    )
    .orderBy(asc(financialPostingMappings.mappingKey));

export const findAccountByCode = (accountCode: string) =>
  db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.code, accountCode))
    .limit(1);

export const savePostingMapping = (
  mappingKey: string,
  accountCode: string,
  actorId: string,
) =>
  db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(financialPostingMappings)
      .values({
        mappingKey,
        accountCode,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: financialPostingMappings.mappingKey,
        set: { accountCode, updatedBy: actorId, updatedAt: new Date() },
      })
      .returning();
    if (!saved) throw new Error("Posting mapping was not saved");
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "POSTING_MAPPING_CHANGED",
        actorId,
        recordType: "POSTING_MAPPING",
        details: { mappingKey, accountCode },
      });
    return saved;
  });

export const findJournals = async (query: {
  page: number;
  limit: number;
  sourceType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  accountCode?: string;
}) => {
  const conditions = [];
  if (query.sourceType)
    conditions.push(eq(financialJournals.sourceType, query.sourceType));
  if (query.actorId)
    conditions.push(eq(financialJournals.actorId, query.actorId));
  if (query.from)
    conditions.push(gte(financialJournals.accountingDate, query.from));
  if (query.to)
    conditions.push(lte(financialJournals.accountingDate, query.to));
  if (query.accountCode) {
    const matching = await db
      .selectDistinct({ journalId: financialJournalLines.journalId })
      .from(financialJournalLines)
      .where(eq(financialJournalLines.accountCode, query.accountCode));
    conditions.push(
      inArray(
        financialJournals.id,
        matching.map((row) => row.journalId),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [totalRow]] = await Promise.all([
    db
      .select()
      .from(financialJournals)
      .where(where)
      .orderBy(
        desc(financialJournals.accountingDate),
        desc(financialJournals.createdAt),
        desc(financialJournals.id),
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(financialJournals).where(where),
  ]);
  const ids = data.map((row) => row.id);
  const summaries = ids.length
    ? await db
        .select({
          journalId: financialJournalLines.journalId,
          debit: sql<string>`sum(${financialJournalLines.debitMinor})`,
          credit: sql<string>`sum(${financialJournalLines.creditMinor})`,
        })
        .from(financialJournalLines)
        .where(inArray(financialJournalLines.journalId, ids))
        .groupBy(financialJournalLines.journalId)
    : [];
  return { data, total: Number(totalRow?.total ?? 0), summaries };
};

export const findJournalById = async (id: string) => {
  const [journal] = await db
    .select()
    .from(financialJournals)
    .where(eq(financialJournals.id, id))
    .limit(1);
  if (!journal) return null;
  const lines = await db
    .select()
    .from(financialJournalLines)
    .where(eq(financialJournalLines.journalId, id))
    .orderBy(asc(financialJournalLines.lineNumber));
  return { journal, lines };
};

export const reverseJournal = (id: string, actorId: string, reason: string, posting: PostingOperations) =>
  db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(financialJournals)
      .where(eq(financialJournals.id, id))
      .for("update")
      .limit(1);
    if (!original) throw new AppError("Journal not found", 404);
    if (original.reversalOfId)
      throw new AppError("A reversal journal cannot be reversed", 409);
    const [existing] = await tx
      .select()
      .from(financialJournals)
      .where(eq(financialJournals.reversalOfId, id))
      .limit(1);
    if (existing) return existing;
    const originals = await tx
      .select()
      .from(financialJournalLines)
      .where(eq(financialJournalLines.journalId, id))
      .orderBy(asc(financialJournalLines.lineNumber));
    const reversalLines: JournalLineInput[] = originals.map((line) => ({
      accountCode: line.accountCode,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      locationId: line.locationId,
      productId: line.productId,
      vendorId: line.vendorId,
      memo: `Reversal: ${reason}`,
    }));
    const reversal = await posting.postJournal(tx, {
      sourceType: "JOURNAL_REVERSAL",
      sourceId: original.id,
      reversalOfId: original.id,
      accountingDate: new Date(),
      currency: original.currency,
      description: `Reversal of ${original.journalNumber}: ${reason}`,
      actorId,
      lines: reversalLines,
    });
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "JOURNAL_REVERSED",
        actorId,
        recordType: "JOURNAL",
        recordId: original.id,
        details: { reversalJournalId: reversal.id, reason },
      });
    return reversal;
  });

export const findTrialBalance = (query: {
  from?: string;
  to?: string;
  currency: string;
}) => {
  const filters = [eq(financialJournals.currency, query.currency)];
  if (query.from)
    filters.push(gte(financialJournals.accountingDate, query.from));
  if (query.to) filters.push(lte(financialJournals.accountingDate, query.to));
  return db
    .select({
      code: financialAccounts.code,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      normalBalance: financialAccounts.normalBalance,
      debitMinor: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}), 0)::text`,
      creditMinor: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}), 0)::text`,
    })
    .from(financialAccounts)
    .leftJoin(
      financialJournalLines,
      eq(financialJournalLines.accountCode, financialAccounts.code),
    )
    .leftJoin(
      financialJournals,
      and(
        eq(financialJournals.id, financialJournalLines.journalId),
        ...filters,
      ),
    )
    .where(eq(financialAccounts.currency, query.currency))
    .groupBy(
      financialAccounts.code,
      financialAccounts.name,
      financialAccounts.accountType,
      financialAccounts.normalBalance,
    )
    .orderBy(asc(financialAccounts.code));
};

export const findIncomeStatement = (query: {
  from: string;
  to: string;
  currency: string;
}) =>
  db
    .select({
      code: financialAccounts.code,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      normalBalance: financialAccounts.normalBalance,
      debitMinor: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}),0)::text`,
      creditMinor: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}),0)::text`,
    })
    .from(financialAccounts)
    .leftJoin(
      financialJournalLines,
      eq(financialJournalLines.accountCode, financialAccounts.code),
    )
    .leftJoin(
      financialJournals,
      and(
        eq(financialJournals.id, financialJournalLines.journalId),
        gte(financialJournals.accountingDate, query.from),
        lte(financialJournals.accountingDate, query.to),
        eq(financialJournals.currency, query.currency),
      ),
    )
    .where(inArray(financialAccounts.accountType, ["REVENUE", "EXPENSE"]))
    .groupBy(
      financialAccounts.code,
      financialAccounts.name,
      financialAccounts.accountType,
      financialAccounts.normalBalance,
    )
    .orderBy(asc(financialAccounts.code));

export const findInventoryValue = async (query: {
  asOf: string;
  locationId?: string;
  productId?: string;
}) => {
  const [mapping] = await db
    .select({ accountCode: financialPostingMappings.accountCode })
    .from(financialPostingMappings)
    .where(eq(financialPostingMappings.mappingKey, "INVENTORY_ASSET"))
    .limit(1);
  if (!mapping)
    throw new AppError(
      "Inventory asset account mapping is not configured",
      409,
    );
  const conditions = [
    eq(financialJournalLines.accountCode, mapping.accountCode),
    lte(financialJournals.accountingDate, query.asOf),
  ];
  if (query.locationId)
    conditions.push(eq(financialJournalLines.locationId, query.locationId));
  if (query.productId)
    conditions.push(eq(financialJournalLines.productId, query.productId));
  return db
    .select({
      locationId: financialJournalLines.locationId,
      productId: financialJournalLines.productId,
      debitMinor: sql
        .raw("coalesce(sum(financial_journal_lines.debit_minor), 0)::text")
        .mapWith(String),
      creditMinor: sql
        .raw("coalesce(sum(financial_journal_lines.credit_minor), 0)::text")
        .mapWith(String),
    })
    .from(financialJournalLines)
    .innerJoin(
      financialJournals,
      eq(financialJournals.id, financialJournalLines.journalId),
    )
    .where(and(...conditions, eq(financialJournals.currency, "KES")))
    .groupBy(financialJournalLines.locationId, financialJournalLines.productId)
    .orderBy(
      asc(financialJournalLines.locationId),
      asc(financialJournalLines.productId),
    );
};

export const findPeriods = () =>
  db
    .select()
    .from(financialPeriods)
    .orderBy(desc(financialPeriods.periodKey))
    .limit(36);

export const closePeriod = (periodKey: string, actorId: string) =>
  db.transaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.periodKey, periodKey))
      .for("update")
      .limit(1);
    if (!period) throw new AppError("Financial period not found", 404);
    if (period.status === "CLOSED") return period;
    const [pending] = await tx
      .select({ total: count() })
      .from(financialProcessedEvents)
      .where(
        and(
          inArray(financialProcessedEvents.status, ["PENDING", "EXCEPTION"]),
          gte(
            financialProcessedEvents.receivedAt,
            new Date(`${period.startsOn}T00:00:00Z`),
          ),
          lt(
            financialProcessedEvents.receivedAt,
            new Date(`${period.endsOn}T00:00:00Z`),
          ),
        ),
      );
    if (Number(pending?.total ?? 0) > 0)
      throw new AppError("This period has unposted source events", 409, [
        {
          field: "periodKey",
          message:
            "Resolve pending and exception events before closing the period.",
        },
      ]);
    const [closed] = await tx
      .update(financialPeriods)
      .set({ status: "CLOSED", closedBy: actorId, closedAt: new Date() })
      .where(eq(financialPeriods.id, period.id))
      .returning();
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "PERIOD_CLOSED",
        actorId,
        recordType: "PERIOD",
        recordId: period.id,
        details: { periodKey },
      });
    return closed!;
  });

export const reopenPeriod = (
  periodKey: string,
  actorId: string,
  reason: string,
) =>
  db.transaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.periodKey, periodKey))
      .for("update")
      .limit(1);
    if (!period) throw new AppError("Financial period not found", 404);
    if (period.status === "OPEN") return period;
    const [opened] = await tx
      .update(financialPeriods)
      .set({
        status: "OPEN",
        reopenedBy: actorId,
        reopenedAt: new Date(),
        reopenReason: reason,
      })
      .where(eq(financialPeriods.id, period.id))
      .returning();
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "PERIOD_REOPENED",
        actorId,
        recordType: "PERIOD",
        recordId: period.id,
        details: { periodKey, reason },
      });
    return opened!;
  });

export const findPostingExceptions = async (query: {
  page: number;
  limit: number;
  status: "PENDING" | "EXCEPTION";
}) => {
  const [data, [row]] = await Promise.all([
    db
      .select({
        eventId: financialProcessedEvents.eventId,
        eventType: financialProcessedEvents.eventType,
        sourceId: financialProcessedEvents.sourceId,
        status: financialProcessedEvents.status,
        lastError: financialProcessedEvents.lastError,
        attempts: financialProcessedEvents.attempts,
        receivedAt: financialProcessedEvents.receivedAt,
        processedAt: financialProcessedEvents.processedAt,
        journalId: financialProcessedEvents.journalId,
      })
      .from(financialProcessedEvents)
      .where(eq(financialProcessedEvents.status, query.status))
      .orderBy(asc(financialProcessedEvents.receivedAt))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db
      .select({ total: count() })
      .from(financialProcessedEvents)
      .where(eq(financialProcessedEvents.status, query.status)),
  ]);
  return { data, total: Number(row?.total ?? 0) };
};

export const findAuditLogs = async (query: {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
}) => {
  const conditions = [];
  if (query.action)
    conditions.push(eq(financialAuditLogs.action, query.action));
  if (query.actorId)
    conditions.push(eq(financialAuditLogs.actorId, query.actorId));
  if (query.from)
    conditions.push(gte(financialAuditLogs.createdAt, new Date(query.from)));
  if (query.to)
    conditions.push(lte(financialAuditLogs.createdAt, new Date(query.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db
      .select()
      .from(financialAuditLogs)
      .where(where)
      .orderBy(desc(financialAuditLogs.createdAt), desc(financialAuditLogs.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(financialAuditLogs).where(where),
  ]);
  return { data, total: Number(row?.total ?? 0) };
};

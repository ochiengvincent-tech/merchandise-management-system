import { and, eq } from "drizzle-orm";
import type { FinancialTx, JournalInput, JournalLineInput } from "./posting-contract.js";
import {
  financialAccounts,
  financialAuditLogs,
  financialJournalLines,
  financialJournals,
  financialPeriods,
  financialPostingMappings,
} from "../../db/schema/financials.js";

export const createOrLockPeriod = async (
  tx: FinancialTx,
  periodKey: string,
  startsOn: string,
  endsOn: string,
) => {
  await tx
    .insert(financialPeriods)
    .values({ periodKey, startsOn, endsOn })
    .onConflictDoNothing({ target: financialPeriods.periodKey });
  const [period] = await tx
    .select()
    .from(financialPeriods)
    .where(eq(financialPeriods.periodKey, periodKey))
    .for("update")
    .limit(1);
  return period;
};

export const findPostingMapping = async (
  tx: FinancialTx,
  mappingKey: string,
) => {
  const [result] = await tx
    .select({ mapping: financialPostingMappings, account: financialAccounts })
    .from(financialPostingMappings)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.code, financialPostingMappings.accountCode),
    )
    .where(eq(financialPostingMappings.mappingKey, mappingKey))
    .limit(1);
  return result;
};

export const findJournalForEvent = async (
  tx: FinancialTx,
  sourceEventId: string,
  postingRuleVersion: number,
) => {
  const [existing] = await tx
    .select()
    .from(financialJournals)
    .where(
      and(
        eq(financialJournals.sourceEventId, sourceEventId),
        eq(financialJournals.postingRuleVersion, postingRuleVersion),
      ),
    )
    .limit(1);
  return existing;
};

export const findAccountForPosting = (tx: FinancialTx, accountCode: string) =>
  tx
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.code, accountCode))
    .limit(1);

export const saveJournal = async (
  tx: FinancialTx,
  input: JournalInput,
  lines: JournalLineInput[],
  periodId: string,
  journalId: string,
  debits: bigint,
  credits: bigint,
) => {
  const dateKey = input.accountingDate
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const [journal] = await tx
    .insert(financialJournals)
    .values({
      id: journalId,
      journalNumber: `JRN-${dateKey}-${journalId.slice(0, 8).toUpperCase()}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      postingRuleVersion: input.postingRuleVersion ?? 1,
      periodId,
      accountingDate: input.accountingDate.toISOString().slice(0, 10),
      currency: input.currency,
      description: input.description,
      actorId: input.actorId ?? null,
      reversalOfId: input.reversalOfId ?? null,
    })
    .returning();
  if (!journal) throw new Error("Financial journal header could not be saved");
  await tx.insert(financialJournalLines).values(
    lines.map((line, index) => ({
      journalId: journal.id,
      lineNumber: index + 1,
      accountCode: line.accountCode,
      debitMinor: line.debitMinor ?? 0n,
      creditMinor: line.creditMinor ?? 0n,
      locationId: line.locationId ?? null,
      productId: line.productId ?? null,
      vendorId: line.vendorId ?? null,
      memo: line.memo ?? null,
    })),
  );
  await tx
    .insert(financialAuditLogs)
    .values({
      action: "JOURNAL_POSTED",
      actorId: input.actorId ?? null,
      recordType: "JOURNAL",
      recordId: journal.id,
      details: {
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceEventId: input.sourceEventId ?? null,
        debitMinor: debits.toString(),
        creditMinor: credits.toString(),
        currency: input.currency,
      },
    });
  return journal;
};

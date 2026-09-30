import { and, eq } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import * as schema from "../../db/schema/financials.js";
import { financialAccounts, financialAuditLogs, financialJournalLines, financialJournals, financialPeriods, financialPostingMappings } from "../../db/schema/financials.js";
import { AppError } from "../../errors/app-error.js";

export type FinancialTx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type JournalLineInput = {
  accountCode: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  locationId?: string | null;
  productId?: string | null;
  vendorId?: string | null;
  memo?: string | null;
};
export type JournalInput = {
  sourceType: string;
  sourceId?: string | null;
  sourceEventId?: string | null;
  postingRuleVersion?: number;
  accountingDate: Date;
  currency: string;
  description: string;
  actorId?: string | null;
  reversalOfId?: string | null;
  lines: JournalLineInput[];
};

export class PostingException extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "PostingException"; }
}

export const postingMappings = {
  TENDER_CASH: ["ASSET", "DEBIT"],
  TENDER_CARD: ["ASSET", "DEBIT"],
  TENDER_GIFT_CARD: ["ASSET", "DEBIT"],
  INVENTORY_ASSET: ["ASSET", "DEBIT"],
  INPUT_TAX: ["ASSET", "DEBIT"],
  GRNI: ["LIABILITY", "CREDIT"],
  ACCOUNTS_PAYABLE: ["LIABILITY", "CREDIT"],
  SALES_TAX_PAYABLE: ["LIABILITY", "CREDIT"],
  OPENING_EQUITY: ["EQUITY", "CREDIT"],
  SALES_REVENUE: ["REVENUE", "CREDIT"],
  SALES_RETURNS: ["REVENUE", "DEBIT"],
  COGS: ["EXPENSE", "DEBIT"],
  INVENTORY_VARIANCE: ["EXPENSE", "DEBIT"],
} as const;

export async function ensurePeriod(tx: FinancialTx, accountingDate: Date) {
  const year = accountingDate.getUTCFullYear();
  const month = accountingDate.getUTCMonth();
  const periodKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const startsOn = `${periodKey}-01`;
  const endsOnDate = new Date(Date.UTC(year, month + 1, 1));
  const endsOn = `${endsOnDate.getUTCFullYear()}-${String(endsOnDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  await tx.insert(financialPeriods).values({ periodKey, startsOn, endsOn }).onConflictDoNothing({ target: financialPeriods.periodKey });
  const [period] = await tx.select().from(financialPeriods).where(eq(financialPeriods.periodKey, periodKey)).for("update").limit(1);
  if (!period) throw new Error(`Financial period ${periodKey} could not be created`);
  if (period.status !== "OPEN") throw new PostingException(`Financial period ${periodKey} is closed. Reopen it before posting this transaction.`, "PERIOD_CLOSED");
  return period;
}

export async function mappingAccount(tx: FinancialTx, mappingKey: string, currency: string) {
  const [result] = await tx.select({ mapping: financialPostingMappings, account: financialAccounts })
    .from(financialPostingMappings)
    .innerJoin(financialAccounts, eq(financialAccounts.code, financialPostingMappings.accountCode))
    .where(eq(financialPostingMappings.mappingKey, mappingKey)).limit(1);
  if (!result || !result.account.active) throw new PostingException(`Posting account mapping ${mappingKey} is missing or inactive.`, "ACCOUNT_MAPPING_MISSING");
  if (result.account.currency !== currency) throw new PostingException(`Posting account mapping ${mappingKey} does not support ${currency}.`, "ACCOUNT_CURRENCY_MISMATCH");
  const expected = postingMappings[mappingKey as keyof typeof postingMappings];
  if (!expected) throw new PostingException("This posting mapping is not supported by the Financials rules.", "UNKNOWN_ACCOUNT_MAPPING");
  if (result.account.accountType !== expected[0] || result.account.normalBalance !== expected[1]) throw new PostingException("Posting mapping " + mappingKey + " must use a " + expected[0] + " account with " + expected[1] + " normal balance.", "ACCOUNT_MAPPING_TYPE_MISMATCH");
  return result.account;
}

export async function postJournal(tx: FinancialTx, input: JournalInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new PostingException("Journal currency must be a three-letter uppercase code.", "INVALID_CURRENCY");
  const lines = input.lines.filter((line) => (line.debitMinor ?? 0n) !== 0n || (line.creditMinor ?? 0n) !== 0n);
  if (lines.length < 2) throw new PostingException("A posted journal must contain at least two non-zero lines.", "INVALID_JOURNAL_LINES");
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    const debit = line.debitMinor ?? 0n;
    const credit = line.creditMinor ?? 0n;
    if (debit < 0n || credit < 0n || (debit === 0n) === (credit === 0n)) throw new PostingException("Each journal line must have a positive debit or credit, but not both.", "INVALID_JOURNAL_LINE");
    debits += debit;
    credits += credit;
  }
  if (debits === 0n || debits !== credits) throw new PostingException("Journal debits and credits must balance to a positive amount.", "UNBALANCED_JOURNAL");

  if (input.sourceEventId) {
    const [existing] = await tx.select().from(financialJournals).where(and(
      eq(financialJournals.sourceEventId, input.sourceEventId),
      eq(financialJournals.postingRuleVersion, input.postingRuleVersion ?? 1),
    )).limit(1);
    if (existing) return existing;
  }

  const uniqueCodes = [...new Set(lines.map((line) => line.accountCode))];
  for (const code of uniqueCodes) {
    const [account] = await tx.select().from(financialAccounts).where(eq(financialAccounts.code, code)).limit(1);
    if (!account || !account.active) throw new PostingException(`Ledger account ${code} is missing or inactive.`, "ACCOUNT_MISSING");
    if (account.currency !== input.currency) throw new PostingException(`Ledger account ${code} does not support ${input.currency}.`, "ACCOUNT_CURRENCY_MISMATCH");
  }

  const period = await ensurePeriod(tx, input.accountingDate);
  const dateKey = input.accountingDate.toISOString().slice(0, 10).replaceAll("-", "");
  const journalId = randomUUID();
  const [journal] = await tx.insert(financialJournals).values({
    id: journalId,
    journalNumber: `JRN-${dateKey}-${journalId.slice(0, 8).toUpperCase()}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    sourceEventId: input.sourceEventId ?? null,
    postingRuleVersion: input.postingRuleVersion ?? 1,
    periodId: period.id,
    accountingDate: input.accountingDate.toISOString().slice(0, 10),
    currency: input.currency,
    description: input.description,
    actorId: input.actorId ?? null,
    reversalOfId: input.reversalOfId ?? null,
  }).returning();
  if (!journal) throw new Error("Financial journal header could not be saved");
  await tx.insert(financialJournalLines).values(lines.map((line, index) => ({
    journalId: journal.id,
    lineNumber: index + 1,
    accountCode: line.accountCode,
    debitMinor: line.debitMinor ?? 0n,
    creditMinor: line.creditMinor ?? 0n,
    locationId: line.locationId ?? null,
    productId: line.productId ?? null,
    vendorId: line.vendorId ?? null,
    memo: line.memo ?? null,
  })));
  await tx.insert(financialAuditLogs).values({ action: "JOURNAL_POSTED", actorId: input.actorId ?? null, recordType: "JOURNAL", recordId: journal.id, details: { sourceType: input.sourceType, sourceId: input.sourceId ?? null, sourceEventId: input.sourceEventId ?? null, debitMinor: debits.toString(), creditMinor: credits.toString(), currency: input.currency } });
  return journal;
}

export function toMinorUnits(amount: number | string) {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new AppError("Amount must be a valid decimal with at most two fractional digits", 400);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -value : value;
}

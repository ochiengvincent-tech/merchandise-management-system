import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import {
  createOrLockPeriod,
  findAccountForPosting,
  findJournalForEvent,
  findPostingMapping,
  saveJournal,
} from "./posting-repository.js";
import type { FinancialTx, JournalInput } from "./posting-contract.js";
export type { FinancialTx, JournalInput, JournalLineInput } from "./posting-contract.js";
import type { JournalLineInput } from "./posting-contract.js";
import { PostingException } from "./posting-error.js";
export { PostingException } from "./posting-error.js";

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
  const period = await createOrLockPeriod(tx, periodKey, startsOn, endsOn);
  if (!period)
    throw new Error(`Financial period ${periodKey} could not be created`);
  if (period.status !== "OPEN")
    throw new PostingException(
      `Financial period ${periodKey} is closed. Reopen it before posting this transaction.`,
      "PERIOD_CLOSED",
    );
  return period;
}

export async function mappingAccount(
  tx: FinancialTx,
  mappingKey: string,
  currency: string,
) {
  const result = await findPostingMapping(tx, mappingKey);
  if (!result || !result.account.active)
    throw new PostingException(
      `Posting account mapping ${mappingKey} is missing or inactive.`,
      "ACCOUNT_MAPPING_MISSING",
    );
  if (result.account.currency !== currency)
    throw new PostingException(
      `Posting account mapping ${mappingKey} does not support ${currency}.`,
      "ACCOUNT_CURRENCY_MISMATCH",
    );
  const expected = postingMappings[mappingKey as keyof typeof postingMappings];
  if (!expected)
    throw new PostingException(
      "This posting mapping is not supported by the Financials rules.",
      "UNKNOWN_ACCOUNT_MAPPING",
    );
  if (
    result.account.accountType !== expected[0] ||
    result.account.normalBalance !== expected[1]
  )
    throw new PostingException(
      "Posting mapping " +
        mappingKey +
        " must use a " +
        expected[0] +
        " account with " +
        expected[1] +
        " normal balance.",
      "ACCOUNT_MAPPING_TYPE_MISMATCH",
    );
  return result.account;
}

export async function postJournal(tx: FinancialTx, input: JournalInput) {
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw new PostingException(
      "Journal currency must be a three-letter uppercase code.",
      "INVALID_CURRENCY",
    );
  const lines = input.lines.filter(
    (line) => (line.debitMinor ?? 0n) !== 0n || (line.creditMinor ?? 0n) !== 0n,
  );
  if (lines.length < 2)
    throw new PostingException(
      "A posted journal must contain at least two non-zero lines.",
      "INVALID_JOURNAL_LINES",
    );
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    const debit = line.debitMinor ?? 0n;
    const credit = line.creditMinor ?? 0n;
    if (debit < 0n || credit < 0n || (debit === 0n) === (credit === 0n))
      throw new PostingException(
        "Each journal line must have a positive debit or credit, but not both.",
        "INVALID_JOURNAL_LINE",
      );
    debits += debit;
    credits += credit;
  }
  if (debits === 0n || debits !== credits)
    throw new PostingException(
      "Journal debits and credits must balance to a positive amount.",
      "UNBALANCED_JOURNAL",
    );

  if (input.sourceEventId) {
    const existing = await findJournalForEvent(
      tx,
      input.sourceEventId,
      input.postingRuleVersion ?? 1,
    );
    if (existing) return existing;
  }

  const uniqueCodes = [...new Set(lines.map((line) => line.accountCode))];
  for (const code of uniqueCodes) {
    const [account] = await findAccountForPosting(tx, code);
    if (!account || !account.active)
      throw new PostingException(
        `Ledger account ${code} is missing or inactive.`,
        "ACCOUNT_MISSING",
      );
    if (account.currency !== input.currency)
      throw new PostingException(
        `Ledger account ${code} does not support ${input.currency}.`,
        "ACCOUNT_CURRENCY_MISMATCH",
      );
  }

  const period = await ensurePeriod(tx, input.accountingDate);
  const journalId = randomUUID();
  return saveJournal(tx, input, lines, period.id, journalId, debits, credits);
}

export function toMinorUnits(amount: number | string) {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text))
    throw new AppError(
      "Amount must be a valid decimal with at most two fractional digits",
      400,
    );
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -value : value;
}

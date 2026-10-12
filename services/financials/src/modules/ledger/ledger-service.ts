import {
  closePeriod,
  createAccount,
  findAccounts,
  findAccountByCode,
  findAuditLogs,
  findIncomeStatement,
  findInventoryValue,
  findJournalById,
  findJournals,
  findPeriods,
  findPostingExceptions,
  findPostingMappings,
  findTrialBalance,
  reopenPeriod,
  reverseJournal,
  savePostingMapping,
} from "./ledger-repository.js";
import { AppError } from "../../errors/app-error.js";
import { retryFinancialEvent } from "../events/financial-event-service.js";
import { mappingAccount, postJournal, postingMappings } from "./posting-service.js";

export const getAccountsService = () => findAccounts();
export async function createAccountService(input: Parameters<typeof createAccount>[0], actorId: string) {
  if (input.currency !== "KES") throw new AppError("Only KES accounts can be created until multi-currency posting is enabled", 400, [{ field: "currency", message: "Use KES for this Financials release." }]);
  return createAccount(input, actorId);
}
export const getPostingMappingsService = findPostingMappings;
export const getAccountByCodeService = findAccountByCode;
export async function savePostingMappingService(mappingKey: string, accountCode: string, actorId: string) {
  const expected = postingMappings[mappingKey as keyof typeof postingMappings];
  if (!expected) throw new AppError("Unsupported posting mapping", 400, [{ field: "mappingKey", message: "Select a mapping defined by Financials." }]);
  const [account] = await findAccountByCode(accountCode);
  if (!account || !account.active || account.currency !== "KES") throw new AppError("Choose an active KES ledger account", 400, [{ field: "accountCode", message: "Select an active KES account." }]);
  if (account.accountType !== expected[0] || account.normalBalance !== expected[1]) throw new AppError(`This mapping requires a ${expected[0]} account with ${expected[1]} normal balance`, 400, [{ field: "accountCode", message: "Choose an account with the required type and normal balance." }]);
  return savePostingMapping(mappingKey, accountCode, actorId);
}
export async function getJournalsService(query: Parameters<typeof findJournals>[0]) {
  if (query.from && query.to && query.from > query.to) throw new AppError("Invalid journal date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  return findJournals(query);
}
export const getJournalByIdService = findJournalById;
export const reverseJournalService = (id: string, actorId: string, reason: string) =>
  reverseJournal(id, actorId, reason, { mappingAccount, postJournal });
export async function getTrialBalanceService(query: Parameters<typeof findTrialBalance>[0]) {
  if (query.from && query.to && query.from > query.to) throw new AppError("Invalid report date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  const rows = await findTrialBalance(query);
  const totals = rows.reduce((sum, row) => ({ debitMinor: sum.debitMinor + BigInt(row.debitMinor), creditMinor: sum.creditMinor + BigInt(row.creditMinor) }), { debitMinor: 0n, creditMinor: 0n });
  return { data: rows.map((row) => ({ ...row, netMinor: (BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() })), currency: query.currency, totals: { debitMinor: totals.debitMinor.toString(), creditMinor: totals.creditMinor.toString(), balanced: totals.debitMinor === totals.creditMinor } };
}
export async function getIncomeStatementService(query: Parameters<typeof findIncomeStatement>[0]) {
  if (query.from > query.to) throw new AppError("Invalid report date range", 400, [{ field: "to", message: "Choose a date on or after From." }]);
  const rows = await findIncomeStatement(query);
  return { data: rows.map((row) => ({ ...row, balanceMinor: (row.normalBalance === "CREDIT" ? BigInt(row.creditMinor) - BigInt(row.debitMinor) : BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() })), from: query.from, to: query.to, currency: query.currency };
}
export async function getInventoryValueService(query: Parameters<typeof findInventoryValue>[0]) {
  const rows = await findInventoryValue(query);
  const data = rows.map((row) => ({ ...row, carryingValueMinor: (BigInt(row.debitMinor) - BigInt(row.creditMinor)).toString() }));
  return { data, asOf: query.asOf, currency: "KES", totalMinor: data.reduce((sum, row) => sum + BigInt(row.carryingValueMinor), 0n).toString() };
}
export const getPeriodsService = findPeriods;
export const closePeriodService = closePeriod;
export const reopenPeriodService = reopenPeriod;
export const getPostingExceptionsService = findPostingExceptions;
export const getAuditLogsService = findAuditLogs;
export const retryPostingEventService = retryFinancialEvent;

import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type * as schema from "../../db/schema/financials.js";
import type { financialAccounts, financialJournals } from "../../db/schema/financials.js";

export type FinancialTx = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
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
export type PostingAccount = typeof financialAccounts.$inferSelect;
export type PostedJournal = typeof financialJournals.$inferSelect;
export type PostingOperations = {
  mappingAccount: (tx: FinancialTx, mappingKey: string, currency: string) => Promise<PostingAccount>;
  postJournal: (tx: FinancialTx, input: JournalInput) => Promise<PostedJournal>;
};

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  financialAuditLogs,
  financialJournals,
  financialProcessedEvents,
} from "../../db/schema/financials.js";
import {
  type FinancialTx,
} from "../ledger/posting-contract.js";
import { PostingException } from "../ledger/posting-error.js";
import type { FinancialEvent } from "./financial-event-contract.js";

export const processFinancialEventTransaction = (
  raw: unknown,
  event: FinancialEvent,
  postingEnabled: boolean,
  postEvent: (
    tx: FinancialTx,
    event: FinancialEvent,
  ) => Promise<typeof financialJournals.$inferSelect | null>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${event.eventId}))`,
    );
    const [current] = await tx
      .select()
      .from(financialProcessedEvents)
      .where(eq(financialProcessedEvents.eventId, event.eventId))
      .for("update")
      .limit(1);
    if (current?.status === "POSTED") return;
    const sourceId =
      event.eventType === "SaleCompleted"
        ? event.payload.saleId
        : event.eventType === "SaleReturned"
          ? event.payload.returnId
          : event.payload.sourceId;
    if (!current)
      await tx
        .insert(financialProcessedEvents)
        .values({
          eventId: event.eventId,
          eventType: event.eventType,
          sourceId,
          status: "PENDING",
          payload: raw as Record<string, unknown>,
        });
    if (!postingEnabled) {
      await tx
        .update(financialProcessedEvents)
        .set({
          status: "PENDING",
          attempts: sql`${financialProcessedEvents.attempts} + 1`,
          lastError:
            "Posting is disabled; this source event is safely captured for later review.",
        })
        .where(eq(financialProcessedEvents.eventId, event.eventId));
      return;
    }
    try {
      const journal = await postEvent(tx, event);
      await tx
        .update(financialProcessedEvents)
        .set({
          status: "POSTED",
          journalId: journal?.id ?? null,
          lastError: null,
          attempts: sql`${financialProcessedEvents.attempts} + 1`,
          processedAt: new Date(),
        })
        .where(eq(financialProcessedEvents.eventId, event.eventId));
      await tx
        .insert(financialAuditLogs)
        .values({
          action: "SOURCE_EVENT_POSTED",
          recordType: "SOURCE_EVENT",
          recordId: event.eventId,
          details: {
            eventType: event.eventType,
            journalId: journal?.id ?? null,
            sourceId,
          },
        });
    } catch (error) {
      if (!(error instanceof PostingException)) throw error;
      await tx
        .update(financialProcessedEvents)
        .set({
          status: "EXCEPTION",
          lastError: `${error.code}: ${error.message}`,
          attempts: sql`${financialProcessedEvents.attempts} + 1`,
        })
        .where(eq(financialProcessedEvents.eventId, event.eventId));
      await tx
        .insert(financialAuditLogs)
        .values({
          action: "POSTING_EXCEPTION",
          recordType: "SOURCE_EVENT",
          recordId: event.eventId,
          details: {
            eventType: event.eventType,
            sourceId,
            code: error.code,
            message: error.message,
          },
        });
    }
  });

export const findProcessedFinancialEvent = (eventId: string) =>
  db
    .select()
    .from(financialProcessedEvents)
    .where(eq(financialProcessedEvents.eventId, eventId))
    .limit(1);

export const findProcessedFinancialEventSummary = (eventId: string) =>
  db
    .select({
      status: financialProcessedEvents.status,
      journalId: financialProcessedEvents.journalId,
      lastError: financialProcessedEvents.lastError,
    })
    .from(financialProcessedEvents)
    .where(eq(financialProcessedEvents.eventId, eventId))
    .limit(1);

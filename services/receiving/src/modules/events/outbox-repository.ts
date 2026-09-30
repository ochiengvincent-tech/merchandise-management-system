import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  goodsReceipts,
  receivingOutboxEvents,
} from "../../db/schema/index.js";

export async function findPublishableOutboxEvents(limit = 100) {
  const rows = await db
    .select({ event: receivingOutboxEvents })
    .from(receivingOutboxEvents)
    .innerJoin(
      goodsReceipts,
      eq(receivingOutboxEvents.aggregateId, goodsReceipts.id),
    )
    .where(
      and(
        eq(receivingOutboxEvents.status, "PENDING"),
        eq(goodsReceipts.procurementSyncStatus, "SYNCED"),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.event);
}

export async function markOutboxEventPublished(id: string) {
  const [event] = await db
    .update(receivingOutboxEvents)
    .set({ status: "PUBLISHED", publishedAt: new Date() })
    .where(eq(receivingOutboxEvents.id, id))
    .returning();
  return event ?? null;
}

export async function incrementOutboxEventAttempt(id: string) {
  const [event] = await db
    .update(receivingOutboxEvents)
    .set({
      attempts: sql`${receivingOutboxEvents.attempts} + 1`,
      // Keep the durable event eligible for retry until RabbitMQ confirms it.
      // The attempt count remains available for operational monitoring.
      status: "PENDING",
    })
    .where(
      and(
        eq(receivingOutboxEvents.id, id),
        eq(receivingOutboxEvents.status, "PENDING"),
      ),
    )
    .returning();
  return event ?? null;
}

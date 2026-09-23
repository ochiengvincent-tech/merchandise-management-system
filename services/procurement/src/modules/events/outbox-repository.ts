import { eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { outboxEvents } from "../../db/schema/outbox-events.js";

export async function createOutboxEventWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: typeof outboxEvents.$inferInsert, database: T) {
  const [event] = await database.insert(outboxEvents).values(data).returning();

  return event ?? null;
}

export async function findPendingOutboxEvents() {
  return db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.status, "PENDING"));
}

export async function markOutboxEventPublished(id: string) {
  const [event] = await db
    .update(outboxEvents)
    .set({
      status: "PUBLISHED",
      publishedAt: new Date(),
    })
    .where(eq(outboxEvents.id, id))
    .returning();

  return event ?? null;
}

export async function markOutboxEventFailed(id: string) {
  const [event] = await db
    .update(outboxEvents)
    .set({
      status: "FAILED",
    })
    .where(eq(outboxEvents.id, id))
    .returning();

  return event ?? null;
}

export async function incrementOutboxEventAttempt(id: string) {
  const [event] = await db
    .update(outboxEvents)
    .set({
      attempts: sql`${outboxEvents.attempts} + 1`,
    })
    .where(eq(outboxEvents.id, id))
    .returning();

  return event ?? null;
}

import { db } from "../../db/index.js";
import { outboxEvents } from "../../db/schema/outbox-events.js";

export async function createOutboxEventWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof outboxEvents.$inferInsert,
  database: T,
) {
  const [event] = await database
    .insert(outboxEvents)
    .values(data)
    .returning();

  return event ?? null;
}
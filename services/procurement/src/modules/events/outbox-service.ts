import { db } from "../../db/index.js";
import { outboxEvents } from "../../db/schema/outbox-events.js";

import { createOutboxEventWithDatabase } from "./outbox-repository.js";

export async function createOutboxEvent<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof outboxEvents.$inferInsert,
  database: T,
) {
  return createOutboxEventWithDatabase(
    data,
    database,
  );
}
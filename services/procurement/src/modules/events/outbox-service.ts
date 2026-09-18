import { outboxEvents } from "../../db/schema/outbox-events.js";
import { createOutboxEventWithDatabase } from "./outbox-repository.js";
import { db } from "../../db/index.js";

export async function createOutboxEvent(
  data: typeof outboxEvents.$inferInsert,
) {
  return createOutboxEventWithDatabase(data, db);
}
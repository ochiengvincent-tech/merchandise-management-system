import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryProcessedEvents } from "../../db/schema/inventory-processed-events.js";

type Database = Pick<typeof db, "select" | "insert">;

export const findProcessedEvent = async (eventId: string) => {
  const [event] = await db
    .select()
    .from(inventoryProcessedEvents)
    .where(eq(inventoryProcessedEvents.eventId, eventId))
    .limit(1);

  return event ?? null;
};

export const createProcessedEvent = async (
  data: typeof inventoryProcessedEvents.$inferInsert,
  database: Database
) => {
  const [event] = await database
    .insert(inventoryProcessedEvents)
    .values(data)
    .onConflictDoNothing({
      target: inventoryProcessedEvents.eventId
    })
    .returning();

  return event;
};
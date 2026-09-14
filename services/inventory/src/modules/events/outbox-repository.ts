import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryOutboxEvents } from "../../db/schema/inventory-outbox-events.js";

type Database = Pick<typeof db, "insert" | "select" | "update">;

export const createOutboxEvent = async (
  data: typeof inventoryOutboxEvents.$inferInsert,
  database: Database
) => {
  const [event] = await database
    .insert(inventoryOutboxEvents)
    .values(data)
    .returning();

  return event;
};

export const findPendingOutboxEvents = async () => {
  return db
    .select()
    .from(inventoryOutboxEvents)
    .where(eq(inventoryOutboxEvents.status, "PENDING"));
};

export const markOutboxEventPublished = async (
  id: string,
  database: Database
) => {
  const [event] = await database
    .update(inventoryOutboxEvents)
    .set({
      status: "PUBLISHED",
      publishedAt: new Date()
    })
    .where(eq(inventoryOutboxEvents.id, id))
    .returning();

  return event ?? null;
};
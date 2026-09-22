import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const inventoryProcessedEvents = pgTable(
  "inventory_processed_events",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    processedAt: timestamp("processed_at", {
      withTimezone: true
    }).notNull().defaultNow()
  }
);
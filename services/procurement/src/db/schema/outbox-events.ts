import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  check,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    eventId: uuid("event_id").notNull(),

    eventType: varchar("event_type", {
      length: 100,
    }).notNull(),

    aggregateType: varchar("aggregate_type", {
      length: 50,
    }).notNull(),

    aggregateId: uuid("aggregate_id").notNull(),

    payload: jsonb("payload").notNull(),

    status: varchar("status", {
      length: 20,
    })
      .notNull()
      .default("PENDING"),

    attempts: integer("attempts")
      .notNull()
      .default(0),

    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    publishedAt: timestamp("published_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("outbox_events_event_id_unique").on(
      table.eventId,
    ),

    check(
      "outbox_events_attempts_non_negative",
      sql`${table.attempts} >= 0`,
    ),

    index("outbox_events_status_idx").on(table.status),

    index("outbox_events_event_type_idx").on(
      table.eventType,
    ),

    index("outbox_events_aggregate_id_idx").on(
      table.aggregateId,
    ),
  ],
);
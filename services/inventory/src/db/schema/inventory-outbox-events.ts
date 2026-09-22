import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  timestamp,
  check,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const inventoryOutboxEvents = pgTable(
  "inventory_outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull(),
    eventType: varchar("event_type", {
      length: 100
    }).notNull(),
    aggregateType: varchar("aggregate_type", {
      length: 100
    }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", {
      length: 20
    }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true
    }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", {
      withTimezone: true
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true
    }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("inventory_outbox_event_id_unique").on(
      table.eventId
    ),
    index("inventory_outbox_status_index").on(table.status),
    index("inventory_outbox_event_type_index").on(
      table.eventType
    ),
    index("inventory_outbox_aggregate_id_index").on(
      table.aggregateId
    ),
    check(
      "inventory_outbox_status_check",
      sql`${table.status} IN ('PENDING', 'PUBLISHED', 'FAILED')`
    ),
    check(
      "inventory_outbox_attempts_check",
      sql`${table.attempts} >= 0`
    )
  ]
);
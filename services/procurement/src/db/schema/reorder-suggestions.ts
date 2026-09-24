import {
  pgTable,
  uuid,
  integer,
  timestamp,
  varchar,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const reorderSuggestionStatus = [
  "PENDING",
  "CONVERTED",
  "DISMISSED",
] as const;

export const reorderSuggestions = pgTable(
  "reorder_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    eventId: uuid("event_id").notNull().unique(),

    productId: uuid("product_id").notNull(),

    locationId: uuid("location_id").notNull(),

    quantityOnHand: integer("quantity_on_hand").notNull(),

    quantityAllocated: integer("quantity_allocated").notNull(),

    quantityAvailable: integer("quantity_available").notNull(),

    reorderLevel: integer("reorder_level").notNull(),

    suggestedQuantity: integer("suggested_quantity").notNull(),

    status: varchar("status", {
      length: 20,
      enum: reorderSuggestionStatus,
    })
      .notNull()
      .default("PENDING"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reorder_suggestions_pending_product_location_idx")
      .on(table.productId, table.locationId)
      .where(sql`${table.status} = 'PENDING'`),

    check(
      "reorder_suggestions_quantities_nonnegative",
      sql`${table.quantityOnHand} >= 0
        AND ${table.quantityAllocated} >= 0
        AND ${table.quantityAvailable} >= 0
        AND ${table.reorderLevel} >= 0
        AND ${table.suggestedQuantity} > 0`,
    ),
  ],
);

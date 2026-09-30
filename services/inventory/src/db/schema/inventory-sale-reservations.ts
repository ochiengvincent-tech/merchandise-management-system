import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { products } from "./products.js";
import { inventoryLocations } from "./inventory-locations.js";

export const inventorySaleReservations = pgTable("inventory_sale_reservations", {
  id: uuid("id").primaryKey(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull().references(() => products.id),
  locationId: uuid("location_id").notNull().references(() => inventoryLocations.id),
  quantity: integer("quantity").notNull(),
  actorId: uuid("actor_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("RESERVED"),
  consumedByEventId: uuid("consumed_by_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("inventory_sale_reservations_idempotency_unique").on(table.idempotencyKey),
  index("inventory_sale_reservations_sale_idx").on(table.saleId),
  check("inventory_sale_reservations_quantity_check", sql`${table.quantity} > 0`),
  check("inventory_sale_reservations_status_check", sql`${table.status} IN ('RESERVED', 'CONSUMED', 'RELEASED')`),
]);

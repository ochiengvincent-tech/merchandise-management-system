import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorCode: varchar("vendor_code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 30 }),
    address: text("address"),
    paymentTerms: varchar("payment_terms", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
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
    check(
      "vendors_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`,
    ),
  ],
);

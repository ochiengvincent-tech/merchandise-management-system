import { pgTable, uuid, char, jsonb, timestamp } from "drizzle-orm/pg-core";

export const purchaseOrderReceiptRequests = pgTable(
  "purchase_order_receipt_requests",
  {
    receivingReceiptId: uuid("receiving_receipt_id").primaryKey(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { purchaseOrders } from "./purchase-orders.js";

export const purchaseOrderApprovals = pgTable(
  "purchase_order_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),

    approverId: uuid("approver_id").notNull(),

    decision: varchar("decision", {
      length: 20,
    }).notNull(),

    comments: text("comments"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
);
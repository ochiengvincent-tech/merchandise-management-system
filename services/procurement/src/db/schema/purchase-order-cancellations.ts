import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { purchaseOrders } from "./purchase-orders.js";

export const purchaseOrderCancellations = pgTable(
  "purchase_order_cancellations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),

    reason: text("reason").notNull(),

    cancelledBy: uuid("cancelled_by").notNull(),

    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("purchase_order_cancellations_po_unique").on(
      table.purchaseOrderId,
    ),
  ],
);
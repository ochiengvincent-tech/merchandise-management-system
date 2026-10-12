import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { purchaseOrderLines } from "../../db/schema/purchase-order-lines.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";
import { purchaseOrderReceiptRequests } from "../../db/schema/purchase-order-receipt-requests.js";

type ReceiptDatabase = Pick<typeof db, "select" | "insert">;

export function findPurchaseOrderReceiptRequest(
  receivingReceiptId: string,
  database: ReceiptDatabase = db,
) {
  return database
    .select()
    .from(purchaseOrderReceiptRequests)
    .where(
      eq(purchaseOrderReceiptRequests.receivingReceiptId, receivingReceiptId),
    )
    .limit(1);
}

export function findPurchaseOrderForUpdate(
  id: string,
  database: ReceiptDatabase,
) {
  return database
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .for("update")
    .limit(1);
}

export function createPurchaseOrderReceiptRequest(
  data: typeof purchaseOrderReceiptRequests.$inferInsert,
  database: ReceiptDatabase,
) {
  return database.insert(purchaseOrderReceiptRequests).values(data);
}

export async function updatePurchaseOrderLineReceivedQuantityWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, quantityReceived: number, database: T) {
  const [purchaseOrderLine] = await database
    .update(purchaseOrderLines)
    .set({
      quantityReceived,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseOrderLines.id, id),
        sql`${quantityReceived} <= ${purchaseOrderLines.quantityOrdered}`,
      ),
    )
    .returning();

  return purchaseOrderLine ?? null;
}

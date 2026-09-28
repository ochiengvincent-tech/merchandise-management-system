import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { purchaseOrderCancellations } from "../../db/schema/purchase-order-cancellations.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

export async function createPurchaseOrderCancellationWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: typeof purchaseOrderCancellations.$inferInsert, database: T) {
  const [cancellation] = await database
    .insert(purchaseOrderCancellations)
    .values(data)
    .returning();

  return cancellation ?? null;
}

export async function findPurchaseOrderCancellation(purchaseOrderId: string) {
  const [cancellation] = await db
    .select()
    .from(purchaseOrderCancellations)
    .where(eq(purchaseOrderCancellations.purchaseOrderId, purchaseOrderId))
    .limit(1);

  return cancellation ?? null;
}

export async function cancelPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, database: T) {
  const [purchaseOrder] = await database
    .update(purchaseOrders)
    .set({
      status: "CANCELLED",
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, id))
    .returning();

  return purchaseOrder ?? null;
}

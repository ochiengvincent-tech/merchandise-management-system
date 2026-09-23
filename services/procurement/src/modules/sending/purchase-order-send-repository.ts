import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

export async function sendPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  database: T,
) {
  const [purchaseOrder] = await database
    .update(purchaseOrders)
    .set({
      status: "SENT",
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, id))
    .returning();

  return purchaseOrder ?? null;
}
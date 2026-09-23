import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

export async function cancelPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  database: T,
) {
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
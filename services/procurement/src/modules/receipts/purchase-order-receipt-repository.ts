import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { purchaseOrderLines } from "../../db/schema/purchase-order-lines.js";

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

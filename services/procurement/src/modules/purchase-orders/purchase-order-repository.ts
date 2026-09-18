import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

export async function createPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof purchaseOrders.$inferInsert,
  database: T,
) {
  const [purchaseOrder] = await database
    .insert(purchaseOrders)
    .values(data)
    .returning();

  return purchaseOrder ?? null;
}

export async function findPurchaseOrderById(id: string) {
  const [purchaseOrder] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1);

  return purchaseOrder ?? null;
}

export async function findPurchaseOrderByNumber(
  poNumber: string,
) {
  const [purchaseOrder] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, poNumber))
    .limit(1);

  return purchaseOrder ?? null;
}

export async function updatePurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  data: Partial<typeof purchaseOrders.$inferInsert>,
  database: T,
) {
  const [purchaseOrder] = await database
    .update(purchaseOrders)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, id))
    .returning();

  return purchaseOrder ?? null;
}
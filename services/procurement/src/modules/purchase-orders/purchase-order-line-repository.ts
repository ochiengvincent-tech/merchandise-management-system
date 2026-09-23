import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrderLines } from "../../db/schema/purchase-order-lines.js";

export async function createPurchaseOrderLineWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: typeof purchaseOrderLines.$inferInsert, database: T) {
  const [purchaseOrderLine] = await database
    .insert(purchaseOrderLines)
    .values(data)
    .returning();

  return purchaseOrderLine ?? null;
}

export async function createPurchaseOrderLinesWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: (typeof purchaseOrderLines.$inferInsert)[], database: T) {
  return database.insert(purchaseOrderLines).values(data).returning();
}

export async function findPurchaseOrderLines(purchaseOrderId: string) {
  return db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
}

export async function findPurchaseOrderLinesWithDatabase<
  T extends Pick<typeof db, "select">,
>(purchaseOrderId: string, database: T) {
  return database
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
}

export async function findPurchaseOrderLineById(id: string) {
  const [purchaseOrderLine] = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, id))
    .limit(1);

  return purchaseOrderLine ?? null;
}

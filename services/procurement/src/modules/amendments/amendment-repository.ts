import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrderAmendments } from "../../db/schema/purchase-order-amendments.js";

export async function createPurchaseOrderAmendmentWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: typeof purchaseOrderAmendments.$inferInsert, database: T) {
  const [amendment] = await database
    .insert(purchaseOrderAmendments)
    .values(data)
    .returning();

  return amendment ?? null;
}

export async function findPurchaseOrderAmendments(purchaseOrderId: string) {
  return db
    .select()
    .from(purchaseOrderAmendments)
    .where(eq(purchaseOrderAmendments.purchaseOrderId, purchaseOrderId));
}

export async function findPurchaseOrderAmendmentById(id: string) {
  const [amendment] = await db
    .select()
    .from(purchaseOrderAmendments)
    .where(eq(purchaseOrderAmendments.id, id))
    .limit(1);

  return amendment ?? null;
}

export async function updatePurchaseOrderAmendmentWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  data: Partial<typeof purchaseOrderAmendments.$inferInsert>,
  database: T,
) {
  const [amendment] = await database
    .update(purchaseOrderAmendments)
    .set(data)
    .where(eq(purchaseOrderAmendments.id, id))
    .returning();

  return amendment ?? null;
}

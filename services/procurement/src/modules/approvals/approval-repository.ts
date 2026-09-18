import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrderApprovals } from "../../db/schema/purchase-order-approvals.js";

export async function createPurchaseOrderApprovalWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof purchaseOrderApprovals.$inferInsert,
  database: T,
) {
  const [approval] = await database
    .insert(purchaseOrderApprovals)
    .values(data)
    .returning();

  return approval ?? null;
}

export async function findPurchaseOrderApprovals(
  purchaseOrderId: string,
) {
  return db
    .select()
    .from(purchaseOrderApprovals)
    .where(
      eq(
        purchaseOrderApprovals.purchaseOrderId,
        purchaseOrderId,
      ),
    );
}
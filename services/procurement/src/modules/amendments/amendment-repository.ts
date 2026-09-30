import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrderAmendments } from "../../db/schema/purchase-order-amendments.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

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

export async function listPurchaseOrderAmendmentQueue({
  offset,
  limit,
  status,
}: {
  offset: number;
  limit: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
}) {
  const whereClause = status
    ? eq(purchaseOrderAmendments.status, status)
    : undefined;
  const rows = await db
    .select({
      amendment: purchaseOrderAmendments,
      purchaseOrder: {
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        currency: purchaseOrders.currency,
        totalAmount: purchaseOrders.totalAmount,
        vendorId: purchaseOrders.vendorId,
        destinationLocationId: purchaseOrders.destinationLocationId,
      },
    })
    .from(purchaseOrderAmendments)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrderAmendments.purchaseOrderId, purchaseOrders.id),
    )
    .where(whereClause)
    .orderBy(desc(purchaseOrderAmendments.createdAt))
    .limit(limit)
    .offset(offset);
  const total = await db.$count(purchaseOrderAmendments, whereClause);

  return {
    data: rows.map(({ amendment, purchaseOrder }) => ({
      ...amendment,
      purchaseOrder,
    })),
    total,
  };
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

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { purchaseOrders } from "../../db/schema/purchase-orders.js";

export async function createPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "insert">,
>(data: typeof purchaseOrders.$inferInsert, database: T) {
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

export async function findPurchaseOrderByNumber(poNumber: string) {
  const [purchaseOrder] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, poNumber))
    .limit(1);

  return purchaseOrder ?? null;
}

type ListPurchaseOrdersFilters = {
  offset: number;
  limit: number;
  status?: string;
  search?: string;
};

export async function listPurchaseOrders({
  offset,
  limit,
  status,
  search,
}: ListPurchaseOrdersFilters) {
  const conditions = [];

  if (status) {
    conditions.push(eq(purchaseOrders.status, status));
  }

  if (search) {
    conditions.push(
      or(
        ilike(purchaseOrders.poNumber, `%${search}%`),
        ilike(purchaseOrders.status, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const data = await db
    .select()
    .from(purchaseOrders)
    .where(whereClause)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db.$count(purchaseOrders, whereClause);

  return {
    data,
    total,
  };
}

export async function updatePurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, data: Partial<typeof purchaseOrders.$inferInsert>, database: T) {
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

export async function approvePurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, approverId: string, database: T) {
  const [purchaseOrder] = await database
    .update(purchaseOrders)
    .set({
      status: "APPROVED",
      approvedAt: new Date(),
      approvedBy: approverId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.status, "PENDING_APPROVAL"),
      ),
    )
    .returning();

  return purchaseOrder ?? null;
}

export async function rejectPurchaseOrderWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, database: T) {
  const [purchaseOrder] = await database
    .update(purchaseOrders)
    .set({
      status: "DRAFT",
      revisionRequired: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.status, "PENDING_APPROVAL"),
      ),
    )
    .returning();

  return purchaseOrder ?? null;
}

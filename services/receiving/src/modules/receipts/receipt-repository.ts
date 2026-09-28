import { and, desc, eq, gte, lte, or, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  goodsReceiptLines,
  goodsReceipts,
  receivingAuditLogs,
  receivingOutboxEvents,
} from "../../db/schema/index.js";

export type NewReceiptLine = Omit<
  typeof goodsReceiptLines.$inferInsert,
  "goodsReceiptId"
>;

export type ReceiptListFilters = {
  purchaseOrderId?: string;
  search?: string;
  discrepancy?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

export async function findGoodsReceiptById(id: string) {
  const [receipt] = await db
    .select()
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, id))
    .limit(1);

  if (!receipt) return null;
  const lines = await db
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, id));

  return { ...receipt, lines };
}

export async function createGoodsReceipt(input: {
  receipt: typeof goodsReceipts.$inferInsert;
  lines: NewReceiptLine[];
  event?: typeof receivingOutboxEvents.$inferInsert;
}) {
  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(goodsReceipts)
      .values(input.receipt)
      .onConflictDoNothing({ target: goodsReceipts.id })
      .returning();
    // A concurrent retry may have inserted the same idempotency key after
    // the caller's initial lookup. Return null so the service can compare the
    // saved request hash and return the original GRN safely.
    if (!receipt) return null;

    const lines = await tx
      .insert(goodsReceiptLines)
      .values(
        input.lines.map((line) => ({
          ...line,
          goodsReceiptId: receipt.id,
        })),
      )
      .returning();

    await tx.insert(receivingAuditLogs).values({
      action: "GRN_RECORDED",
      actorId: receipt.receivedBy,
      goodsReceiptId: receipt.id,
      details: {
        purchaseOrderId: receipt.purchaseOrderId,
        grnNumber: receipt.grnNumber,
        lineCount: lines.length,
        discrepancies: lines.flatMap((line) =>
          line.discrepancies.map((discrepancy) => ({
            productCode: line.productCode,
            discrepancy,
          })),
        ),
      },
    });

    if (input.event) {
      await tx.insert(receivingOutboxEvents).values(input.event);
    }

    return { ...receipt, lines };
  });
}

export async function updateProcurementSync(
  id: string,
  status: "PENDING" | "SYNCED" | "RETRYING",
  errorMessage?: string,
) {
  return db.transaction(async (tx) => {
    const [previousReceipt] = await tx
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, id))
      .limit(1);
    if (!previousReceipt) return null;

    const [receipt] = await tx
      .update(goodsReceipts)
      .set({
        procurementSyncStatus: status,
        procurementSyncError: errorMessage ?? null,
      })
      .where(eq(goodsReceipts.id, id))
      .returning();

    if (!receipt) return null;

    const changed =
      previousReceipt.procurementSyncStatus !== status ||
      previousReceipt.procurementSyncError !== (errorMessage ?? null);
    if (changed && (status === "SYNCED" || status === "RETRYING")) {
      await tx.insert(receivingAuditLogs).values({
        action:
          status === "SYNCED"
            ? "GRN_PROCUREMENT_SYNCED"
            : "GRN_SYNC_RETRY_FAILED",
        actorId: receipt.receivedBy,
        goodsReceiptId: receipt.id,
        details: {
          purchaseOrderId: receipt.purchaseOrderId,
          ...(status === "RETRYING" && errorMessage
            ? { message: errorMessage }
            : {}),
        },
      });
    }

    return receipt;
  });
}

export async function listGoodsReceipts(filters: ReceiptListFilters) {
  const conditions: SQL[] = [];
  if (filters.purchaseOrderId) {
    conditions.push(eq(goodsReceipts.purchaseOrderId, filters.purchaseOrderId));
  }
  if (filters.search) {
    const searchCondition = or(
      ilike(goodsReceipts.grnNumber, `%${filters.search}%`),
      ilike(goodsReceipts.supplierDeliveryNote, `%${filters.search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (filters.from) conditions.push(gte(goodsReceipts.receivedAt, filters.from));
  if (filters.to) conditions.push(lte(goodsReceipts.receivedAt, filters.to));
  if (filters.discrepancy) {
    conditions.push(sql`exists (
      select 1 from goods_receipt_lines grl
      where grl.goods_receipt_id = ${goodsReceipts.id}
        and grl.discrepancies @> ${JSON.stringify([filters.discrepancy])}::jsonb
    )`);
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const receipts = await db
    .select()
    .from(goodsReceipts)
    .where(where)
    .orderBy(desc(goodsReceipts.receivedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  const data = await Promise.all(
    receipts.map(async (receipt) => {
      const lines = await db
        .select()
        .from(goodsReceiptLines)
        .where(eq(goodsReceiptLines.goodsReceiptId, receipt.id));
      return {
        ...receipt,
        lines,
      };
    }),
  );

  const total = await db.$count(goodsReceipts, where);
  return { data, total };
}

export async function findPendingProcurementSyncs(limit = 100) {
  const receipts = await db
    .select()
    .from(goodsReceipts)
    .where(
      or(
        eq(goodsReceipts.procurementSyncStatus, "PENDING"),
        eq(goodsReceipts.procurementSyncStatus, "RETRYING"),
      ),
    )
    .orderBy(desc(goodsReceipts.createdAt))
    .limit(limit);

  return Promise.all(
    receipts.map((receipt) => findGoodsReceiptById(receipt.id)),
  ).then((results) => results.filter((receipt) => receipt !== null));
}

export async function listReceivingAuditLogs(
  limit = 100,
  offset = 0,
  filters: { action?: string; actorId?: string; from?: Date; to?: Date } = {},
) {
  const conditions: SQL[] = [];
  if (filters.action) conditions.push(eq(receivingAuditLogs.action, filters.action));
  if (filters.actorId) conditions.push(eq(receivingAuditLogs.actorId, filters.actorId));
  if (filters.from) conditions.push(gte(receivingAuditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(receivingAuditLogs.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;

  const [data, total] = await Promise.all([
    db
      .select()
      .from(receivingAuditLogs)
      .where(where)
      .orderBy(desc(receivingAuditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.$count(receivingAuditLogs, where),
  ]);
  return { data, total };
}

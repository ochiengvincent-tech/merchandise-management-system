import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  vendorReliabilityOrders,
  vendorReliabilityReceipts,
  vendorReliabilitySummaries,
  type ReliabilityOrderLineSnapshot,
  type ReliabilityReceiptLine,
} from "../../db/schema/vendor-reliability.js";

export type PurchaseOrderSentFact = {
  purchaseOrderId: string;
  vendorId: string;
  poNumber: string;
  sentAt: string;
  lines: Array<{
    purchaseOrderLineId: string;
    productId: string;
    quantityOrdered: number;
    leadTimeDaysSnapshot: number | null;
  }>;
};

export type GoodsReceivedFact = {
  goodsReceiptId: string;
  purchaseOrderId: string;
  vendorId: string;
  receivedAt: string;
  lines: ReliabilityReceiptLine[];
};

const FORMULA_VERSION = "v1";
const ROLLING_WINDOW_DAYS = 365;

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function refreshOrderMetrics(purchaseOrderId: string) {
  const [order] = await db
    .select()
    .from(vendorReliabilityOrders)
    .where(eq(vendorReliabilityOrders.purchaseOrderId, purchaseOrderId))
    .limit(1);
  if (!order || order.status === "CANCELLED") return order ?? null;

  const receipts = await db
    .select()
    .from(vendorReliabilityReceipts)
    .where(eq(vendorReliabilityReceipts.purchaseOrderId, purchaseOrderId));

  const linesById = new Map<string, ReliabilityOrderLineSnapshot>(
    order.lines.map((line) => [line.purchaseOrderLineId, line]),
  );
  let observedUnits = 0;
  let damagedUnits = 0;
  let acceptedUnits = 0;
  let acceptedOnTimeUnits = 0;

  for (const receipt of receipts) {
    const receivedAt = receipt.receivedAt.getTime();
    for (const line of receipt.lines) {
      observedUnits += line.quantityObserved;
      damagedUnits += line.quantityDamaged;
      if (!line.purchaseOrderLineId || !linesById.has(line.purchaseOrderLineId)) continue;
      acceptedUnits += line.quantityAccepted;
      const orderLine = linesById.get(line.purchaseOrderLineId)!;
      if (orderLine.leadTimeDays === null) continue;
      const dueAt = addDays(order.sentAt, orderLine.leadTimeDays).getTime();
      if (receivedAt <= dueAt) acceptedOnTimeUnits += line.quantityAccepted;
    }
  }

  const allLinesHaveLeadTimes = order.lines.every((line) => line.leadTimeDays !== null);
  const onTimeRate = allLinesHaveLeadTimes
    ? percent(acceptedOnTimeUnits, order.orderedUnits)
    : 0;
  const fulfillmentRate = percent(
    Math.min(acceptedUnits, order.orderedUnits),
    order.orderedUnits,
  );
  const qualityRate = observedUnits > 0
    ? percent(Math.max(0, observedUnits - damagedUnits), observedUnits)
    : 0;
  const score = Math.round(
    0.5 * onTimeRate + 0.3 * fulfillmentRate + 0.2 * qualityRate,
  );
  const status = acceptedUnits >= order.orderedUnits ? "COMPLETED" : order.status;

  const [updated] = await db
    .update(vendorReliabilityOrders)
    .set({
      observedUnits,
      damagedUnits,
      acceptedUnits,
      acceptedOnTimeUnits,
      onTimeRate,
      fulfillmentRate,
      qualityRate,
      score,
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendorReliabilityOrders.purchaseOrderId, purchaseOrderId))
    .returning();
  return updated ?? null;
}

async function refreshSummary(vendorId: string, now = new Date()) {
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const orders = await db
    .select()
    .from(vendorReliabilityOrders)
    .where(
      and(
        eq(vendorReliabilityOrders.vendorId, vendorId),
        gte(vendorReliabilityOrders.sentAt, periodStart),
      ),
    );
  const eligible = orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      order.dueAt !== null &&
      (order.status === "COMPLETED" || order.dueAt <= now),
  );
  const average = (values: number[]) =>
    values.length === 0
      ? 0
      : Math.round(values.reduce((total, value) => total + value, 0) / values.length);
  const summary = {
    vendorId,
    score: average(eligible.map((order) => order.score)),
    onTimeRate: average(eligible.map((order) => order.onTimeRate)),
    fulfillmentRate: average(eligible.map((order) => order.fulfillmentRate)),
    qualityRate: average(eligible.map((order) => order.qualityRate)),
    eligiblePurchaseOrders: eligible.length,
    periodStart,
    periodEnd: now,
    formulaVersion: FORMULA_VERSION,
    calculatedAt: now,
  };

  await db
    .insert(vendorReliabilitySummaries)
    .values(summary)
    .onConflictDoUpdate({
      target: vendorReliabilitySummaries.vendorId,
      set: {
        score: summary.score,
        onTimeRate: summary.onTimeRate,
        fulfillmentRate: summary.fulfillmentRate,
        qualityRate: summary.qualityRate,
        eligiblePurchaseOrders: summary.eligiblePurchaseOrders,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        formulaVersion: summary.formulaVersion,
        calculatedAt: summary.calculatedAt,
      },
    });
  return summary;
}

export async function recordPurchaseOrderSent(fact: PurchaseOrderSentFact) {
  const sentAt = new Date(fact.sentAt);
  const lines: ReliabilityOrderLineSnapshot[] = fact.lines.map((line) => ({
    purchaseOrderLineId: line.purchaseOrderLineId,
    productId: line.productId,
    quantityOrdered: line.quantityOrdered,
    leadTimeDays: line.leadTimeDaysSnapshot,
  }));
  const hasCompleteLeadTimeSnapshot = lines.every((line) => line.leadTimeDays !== null);
  const dueAt = hasCompleteLeadTimeSnapshot
    ? lines.reduce<Date | null>((latest, line) => {
        const lineDueAt = addDays(sentAt, line.leadTimeDays!);
        return !latest || lineDueAt > latest ? lineDueAt : latest;
      }, null)
    : null;

  await db
    .insert(vendorReliabilityOrders)
    .values({
      purchaseOrderId: fact.purchaseOrderId,
      vendorId: fact.vendorId,
      poNumber: fact.poNumber,
      sentAt,
      dueAt,
      lines,
      status: "OPEN",
      orderedUnits: lines.reduce((sum, line) => sum + line.quantityOrdered, 0),
    })
    .onConflictDoNothing({ target: vendorReliabilityOrders.purchaseOrderId });

  await refreshOrderMetrics(fact.purchaseOrderId);
  await refreshSummary(fact.vendorId);
}

export async function recordGoodsReceived(fact: GoodsReceivedFact) {
  await db
    .insert(vendorReliabilityReceipts)
    .values({
      goodsReceiptId: fact.goodsReceiptId,
      purchaseOrderId: fact.purchaseOrderId,
      vendorId: fact.vendorId,
      receivedAt: new Date(fact.receivedAt),
      lines: fact.lines,
    })
    .onConflictDoNothing({ target: vendorReliabilityReceipts.goodsReceiptId });

  await refreshOrderMetrics(fact.purchaseOrderId);
  await refreshSummary(fact.vendorId);
}

export async function recordPurchaseOrderCancelled(
  purchaseOrderId: string,
  cancelledAt: string,
) {
  const [existing] = await db
    .select()
    .from(vendorReliabilityOrders)
    .where(eq(vendorReliabilityOrders.purchaseOrderId, purchaseOrderId))
    .limit(1);
  if (!existing) return;

  // A buyer cancellation only excludes the PO if it happened before the
  // agreement-based due date. Later cancellations cannot erase measurable
  // late or incomplete supplier performance.
  if (existing.dueAt && new Date(cancelledAt) < existing.dueAt) {
    await db
      .update(vendorReliabilityOrders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(vendorReliabilityOrders.purchaseOrderId, purchaseOrderId));
  }
  await refreshSummary(existing.vendorId);
}

export async function getVendorReliability(vendorId: string) {
  const summary = await refreshSummary(vendorId);
  const orders = await db
    .select()
    .from(vendorReliabilityOrders)
    .where(
      and(
        eq(vendorReliabilityOrders.vendorId, vendorId),
        gte(vendorReliabilityOrders.sentAt, summary.periodStart),
      ),
    )
    .orderBy(desc(vendorReliabilityOrders.sentAt));
  const history = orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      order.dueAt !== null &&
      (order.status === "COMPLETED" || order.dueAt <= new Date()),
  );
  return {
    summary: {
      ...summary,
      score: summary.eligiblePurchaseOrders >= 3 ? summary.score : null,
      minimumEligiblePurchaseOrders: 3,
    },
    history,
  };
}

export async function getVendorReliabilitySummaries(vendorIds: string[]) {
  if (vendorIds.length === 0) return [];
  return db
    .select()
    .from(vendorReliabilitySummaries)
    .where(inArray(vendorReliabilitySummaries.vendorId, vendorIds));
}

export async function refreshAllVendorReliabilitySummaries() {
  const vendors = await db
    .selectDistinct({ vendorId: vendorReliabilityOrders.vendorId })
    .from(vendorReliabilityOrders);
  for (const { vendorId } of vendors) {
    await refreshSummary(vendorId);
  }
}

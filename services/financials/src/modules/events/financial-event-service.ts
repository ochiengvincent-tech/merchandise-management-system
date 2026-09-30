import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { financialAuditLogs, financialProcessedEvents } from "../../db/schema/financials.js";
import { PostingException, mappingAccount, postJournal } from "../ledger/posting-service.js";

const uuid = z.uuid();
const amountMinor = z.number().int().nonnegative().safe();
const tenderSchema = z.object({ id: z.string().min(1), method: z.enum(["CASH", "CARD", "GIFT_CARD"]), amountMinor, outcome: z.enum(["RECORDED", "SUCCEEDED"]) });
const completedSchema = z.object({
  eventId: uuid, eventType: z.literal("SaleCompleted"), aggregateType: z.literal("Sale"), aggregateId: uuid, occurredAt: z.iso.datetime(),
  payload: z.object({
    schemaVersion: z.literal(1), saleId: uuid, receiptNumber: z.string().min(1), registerId: uuid, actorId: uuid, locationId: uuid,
    currency: z.string().length(3), completedAt: z.iso.datetime(), totalMinor: amountMinor,
    lines: z.array(z.object({ productId: uuid, locationId: uuid.optional(), quantity: z.number().int().positive(), taxMinor: amountMinor, lineTotalMinor: amountMinor })).min(1),
    tenders: z.array(tenderSchema).min(1),
  }),
}).superRefine((event, ctx) => {
  if (event.aggregateId !== event.payload.saleId) ctx.addIssue({ code: "custom", path: ["aggregateId"], message: "Sale aggregate ID must match saleId." });
  if (event.payload.tenders.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) !== BigInt(event.payload.totalMinor)) ctx.addIssue({ code: "custom", path: ["payload", "tenders"], message: "Recorded tenders must equal the completed sale total." });
  if (event.payload.lines.some((line) => line.taxMinor > line.lineTotalMinor) || event.payload.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n) !== BigInt(event.payload.totalMinor)) ctx.addIssue({ code: "custom", path: ["payload", "lines"], message: "Sale line totals must equal the completed sale total and include valid tax amounts." });
});
const returnedSchema = z.object({
  eventId: uuid, eventType: z.literal("SaleReturned"), aggregateType: z.literal("Sale"), aggregateId: uuid, occurredAt: z.iso.datetime(),
  payload: z.object({
    schemaVersion: z.literal(1), returnId: uuid, saleId: uuid, actorId: uuid, locationId: uuid, currency: z.string().length(3),
    returnedAt: z.iso.datetime(), totalRefundMinor: amountMinor,
    lines: z.array(z.object({ productId: uuid, quantity: z.number().int().positive(), refundMinor: amountMinor, taxRefundMinor: amountMinor.optional() })).min(1),
    tenders: z.array(tenderSchema).min(1),
  }),
}).superRefine((event, ctx) => {
  if (event.aggregateId !== event.payload.saleId) ctx.addIssue({ code: "custom", path: ["aggregateId"], message: "Sale aggregate ID must match saleId." });
  if (event.payload.tenders.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) !== BigInt(event.payload.totalRefundMinor)) ctx.addIssue({ code: "custom", path: ["payload", "tenders"], message: "Refund tenders must equal the recorded refund total." });
  if (event.payload.lines.reduce((sum, line) => sum + BigInt(line.refundMinor), 0n) !== BigInt(event.payload.totalRefundMinor)) ctx.addIssue({ code: "custom", path: ["payload", "lines"], message: "Refund lines must equal the recorded refund total." });
  for (const line of event.payload.lines) if (line.taxRefundMinor !== undefined && line.taxRefundMinor > line.refundMinor) ctx.addIssue({ code: "custom", path: ["payload", "lines"], message: "Tax refund cannot exceed the line refund." });
});
const valuationSchema = z.object({
  eventId: uuid, eventType: z.literal("InventoryValuationChanged"), aggregateType: z.literal("InventoryStock"), aggregateId: uuid, occurredAt: z.iso.datetime(),
  payload: z.object({
    schemaVersion: z.literal(1), sourceType: z.enum(["OPENING_BALANCE", "RECEIPT", "SALE", "RETURN", "ADJUSTMENT"]), sourceId: uuid, sourceEventId: uuid,
    productId: uuid, locationId: uuid, currency: z.string().length(3), quantityDelta: z.number().int(),
    carryingValueDeltaMinor: z.string().regex(/^-?\d+$/).refine((value) => { const amount = BigInt(value); return amount >= -9_223_372_036_854_775_807n && amount <= 9_223_372_036_854_775_807n; }), costPolicyVersion: z.string().min(1),
    reason: z.enum(["OPENING_BALANCE", "RECEIPT", "SALE_CONSUMPTION", "RETURN_RESTOCK", "WRITE_OFF", "ADJUSTMENT_GAIN", "ADJUSTMENT_LOSS", "RECEIPT_COST_RECONCILIATION"]),
  }),
});
export const financialEventSchema = z.discriminatedUnion("eventType", [completedSchema, returnedSchema, valuationSchema]);
export type FinancialEvent = z.infer<typeof financialEventSchema>;

function ensurePostingAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new PostingException(`${label} is outside the supported exact minor-unit range.`, "AMOUNT_OUT_OF_RANGE");
  return BigInt(value);
}

async function postSale(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], event: z.infer<typeof completedSchema>) {
  const payload = event.payload;
  if (payload.currency !== "KES") throw new PostingException(`No approved chart is configured for ${payload.currency}.`, "UNSUPPORTED_CURRENCY");
  const lines = [];
  const tenderKeys = { CASH: "TENDER_CASH", CARD: "TENDER_CARD", GIFT_CARD: "TENDER_GIFT_CARD" } as const;
  const tenderGroups = new Map<string, bigint>();
  for (const tender of payload.tenders) tenderGroups.set(tender.method, (tenderGroups.get(tender.method) ?? 0n) + ensurePostingAmount(tender.amountMinor, "Tender amount"));
  for (const [method, amount] of tenderGroups) {
    const account = await mappingAccount(tx, tenderKeys[method as keyof typeof tenderKeys], payload.currency);
    lines.push({ accountCode: account.code, debitMinor: amount, memo: `${method} recorded tender clearing` });
  }
  const revenue = await mappingAccount(tx, "SALES_REVENUE", payload.currency);
  const salesTax = await mappingAccount(tx, "SALES_TAX_PAYABLE", payload.currency);
  const netMinor = payload.lines.reduce((sum, line) => sum + (BigInt(line.lineTotalMinor) - BigInt(line.taxMinor)), 0n);
  const taxMinor = payload.lines.reduce((sum, line) => sum + BigInt(line.taxMinor), 0n);
  if (netMinor > 0n) lines.push({ accountCode: revenue.code, creditMinor: netMinor, locationId: payload.locationId, memo: "Retail sales net revenue" });
  if (taxMinor > 0n) lines.push({ accountCode: salesTax.code, creditMinor: taxMinor, locationId: payload.locationId, memo: "Recorded sales tax liability" });
  return postJournal(tx, { sourceType: "SALE_COMPLETED", sourceId: payload.saleId, sourceEventId: event.eventId, accountingDate: new Date(payload.completedAt), currency: payload.currency, description: `Retail sale ${payload.receiptNumber}`, actorId: payload.actorId, lines });
}

async function postRefund(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], event: z.infer<typeof returnedSchema>) {
  const payload = event.payload;
  if (payload.currency !== "KES") throw new PostingException(`No approved chart is configured for ${payload.currency}.`, "UNSUPPORTED_CURRENCY");
  if (payload.lines.some((line) => line.taxRefundMinor === undefined)) throw new PostingException("The source refund does not include an itemized tax reversal. Update Retail Sales before posting this refund.", "REFUND_TAX_BREAKDOWN_MISSING");
  const taxMinor = payload.lines.reduce((sum, line) => sum + BigInt(line.taxRefundMinor!), 0n);
  const grossMinor = payload.lines.reduce((sum, line) => sum + ensurePostingAmount(line.refundMinor, "Refund amount"), 0n);
  if (taxMinor > grossMinor) throw new PostingException("Refund tax exceeds the gross refund.", "REFUND_TAX_INVALID");
  const returnsAccount = await mappingAccount(tx, "SALES_RETURNS", payload.currency);
  const salesTax = await mappingAccount(tx, "SALES_TAX_PAYABLE", payload.currency);
  const lines = [];
  const netMinor = grossMinor - taxMinor;
  if (netMinor > 0n) lines.push({ accountCode: returnsAccount.code, debitMinor: netMinor, locationId: payload.locationId, memo: "Retail sales return" });
  if (taxMinor > 0n) lines.push({ accountCode: salesTax.code, debitMinor: taxMinor, locationId: payload.locationId, memo: "Sales tax reversal on refund" });
  const tenderKeys = { CASH: "TENDER_CASH", CARD: "TENDER_CARD", GIFT_CARD: "TENDER_GIFT_CARD" } as const;
  const tenderGroups = new Map<string, bigint>();
  for (const tender of payload.tenders) tenderGroups.set(tender.method, (tenderGroups.get(tender.method) ?? 0n) + ensurePostingAmount(tender.amountMinor, "Refund tender amount"));
  for (const [method, amount] of tenderGroups) {
    const account = await mappingAccount(tx, tenderKeys[method as keyof typeof tenderKeys], payload.currency);
    lines.push({ accountCode: account.code, creditMinor: amount, memo: `${method} recorded refund clearing` });
  }
  return postJournal(tx, { sourceType: "SALE_RETURNED", sourceId: payload.returnId, sourceEventId: event.eventId, accountingDate: new Date(payload.returnedAt), currency: payload.currency, description: `Retail refund for sale ${payload.saleId}`, actorId: payload.actorId, lines });
}

async function postValuation(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], event: z.infer<typeof valuationSchema>) {
  const payload = event.payload;
  if (payload.currency !== "KES") throw new PostingException(`No approved chart is configured for ${payload.currency}.`, "UNSUPPORTED_CURRENCY");
  if (payload.costPolicyVersion !== "moving-weighted-average-v1") throw new PostingException("The Inventory cost snapshot is not available under an approved costing policy.", "INVENTORY_COST_POLICY_UNAPPROVED");
  const delta = BigInt(payload.carryingValueDeltaMinor);
  if (delta === 0n) return null;
  const inventory = await mappingAccount(tx, "INVENTORY_ASSET", payload.currency);
  const lines = [];
  const dimensions = { productId: payload.productId, locationId: payload.locationId };
  const abs = delta < 0n ? -delta : delta;
  if (payload.reason === "OPENING_BALANCE" && delta > 0n) {
    const openingEquity = await mappingAccount(tx, "OPENING_EQUITY", payload.currency);
    lines.push({ accountCode: inventory.code, debitMinor: abs, ...dimensions, memo: "Opening inventory carrying value" });
    lines.push({ accountCode: openingEquity.code, creditMinor: abs, ...dimensions, memo: "Opening inventory equity offset" });
  } else if (payload.reason === "RECEIPT" && delta > 0n) {
    const grni = await mappingAccount(tx, "GRNI", payload.currency);
    lines.push({ accountCode: inventory.code, debitMinor: abs, ...dimensions, memo: "Inventory received at moving-average carrying value" });
    lines.push({ accountCode: grni.code, creditMinor: abs, ...dimensions, memo: `Goods received not invoiced ${payload.sourceId}` });
  } else if (payload.reason === "RECEIPT_COST_RECONCILIATION") {
    const grni = await mappingAccount(tx, "GRNI", payload.currency);
    if (delta < 0n) {
      lines.push({ accountCode: grni.code, debitMinor: abs, ...dimensions, memo: "Reconcile receipt carrying value to exact acquisition cost" });
      lines.push({ accountCode: inventory.code, creditMinor: abs, ...dimensions, memo: "Correct receipt cost rounding in inventory" });
    } else {
      lines.push({ accountCode: inventory.code, debitMinor: abs, ...dimensions, memo: "Reconcile receipt carrying value to exact acquisition cost" });
      lines.push({ accountCode: grni.code, creditMinor: abs, ...dimensions, memo: "Correct receipt cost rounding in GRNI" });
    }
  } else if (payload.reason === "SALE_CONSUMPTION" && delta < 0n) {
    const cogs = await mappingAccount(tx, "COGS", payload.currency);
    lines.push({ accountCode: cogs.code, debitMinor: abs, ...dimensions, memo: "Inventory cost consumed by sale" });
    lines.push({ accountCode: inventory.code, creditMinor: abs, ...dimensions, memo: "Reduce inventory carrying value" });
  } else if (payload.reason === "RETURN_RESTOCK" && delta > 0n) {
    const cogs = await mappingAccount(tx, "COGS", payload.currency);
    lines.push({ accountCode: inventory.code, debitMinor: abs, ...dimensions, memo: "Restore original inventory cost on sellable return" });
    lines.push({ accountCode: cogs.code, creditMinor: abs, ...dimensions, memo: "Reverse cost of goods for sellable return" });
  } else if (payload.reason === "WRITE_OFF" && delta < 0n) {
    const variance = await mappingAccount(tx, "INVENTORY_VARIANCE", payload.currency);
    lines.push({ accountCode: variance.code, debitMinor: abs, ...dimensions, memo: "Inventory write-off" });
    lines.push({ accountCode: inventory.code, creditMinor: abs, ...dimensions, memo: "Reduce inventory carrying value" });
  } else if (payload.reason === "ADJUSTMENT_GAIN" && delta > 0n) {
    const variance = await mappingAccount(tx, "INVENTORY_VARIANCE", payload.currency);
    lines.push({ accountCode: inventory.code, debitMinor: abs, ...dimensions, memo: "Inventory adjustment gain" });
    lines.push({ accountCode: variance.code, creditMinor: abs, ...dimensions, memo: "Offset inventory adjustment gain" });
  } else if (payload.reason === "ADJUSTMENT_LOSS" && delta < 0n) {
    const variance = await mappingAccount(tx, "INVENTORY_VARIANCE", payload.currency);
    lines.push({ accountCode: variance.code, debitMinor: abs, ...dimensions, memo: "Inventory adjustment loss" });
    lines.push({ accountCode: inventory.code, creditMinor: abs, ...dimensions, memo: "Reduce inventory carrying value" });
  } else {
    throw new PostingException(`Cost change ${payload.reason} has an invalid value-delta sign.`, "VALUATION_SIGN_MISMATCH");
  }
  return postJournal(tx, { sourceType: "INVENTORY_VALUATION_CHANGED", sourceId: payload.sourceId, sourceEventId: event.eventId, accountingDate: new Date(event.occurredAt), currency: payload.currency, description: `Inventory ${payload.reason.toLowerCase().replaceAll("_", " ")} for product ${payload.productId}`, lines });
}

async function postEvent(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], event: FinancialEvent) {
  if (event.eventType === "SaleCompleted") return postSale(tx, event);
  if (event.eventType === "SaleReturned") return postRefund(tx, event);
  return postValuation(tx, event);
}

export async function processFinancialEvent(raw: unknown) {
  const event = financialEventSchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${event.eventId}))`);
    const [current] = await tx.select().from(financialProcessedEvents).where(eq(financialProcessedEvents.eventId, event.eventId)).for("update").limit(1);
    if (current?.status === "POSTED") return;
    const sourceId = event.eventType === "SaleCompleted" ? event.payload.saleId : event.eventType === "SaleReturned" ? event.payload.returnId : event.payload.sourceId;
    if (!current) await tx.insert(financialProcessedEvents).values({ eventId: event.eventId, eventType: event.eventType, sourceId, status: "PENDING", payload: raw as Record<string, unknown> });
    if (!env.postingEnabled) {
      await tx.update(financialProcessedEvents).set({ status: "PENDING", attempts: sql`${financialProcessedEvents.attempts} + 1`, lastError: "Posting is disabled; this source event is safely captured for later review." }).where(eq(financialProcessedEvents.eventId, event.eventId));
      return;
    }
    try {
      const journal = await postEvent(tx, event);
      await tx.update(financialProcessedEvents).set({ status: "POSTED", journalId: journal?.id ?? null, lastError: null, attempts: sql`${financialProcessedEvents.attempts} + 1`, processedAt: new Date() }).where(eq(financialProcessedEvents.eventId, event.eventId));
      await tx.insert(financialAuditLogs).values({ action: "SOURCE_EVENT_POSTED", recordType: "SOURCE_EVENT", recordId: event.eventId, details: { eventType: event.eventType, journalId: journal?.id ?? null, sourceId } });
    } catch (error) {
      if (!(error instanceof PostingException)) throw error;
      await tx.update(financialProcessedEvents).set({ status: "EXCEPTION", lastError: `${error.code}: ${error.message}`, attempts: sql`${financialProcessedEvents.attempts} + 1` }).where(eq(financialProcessedEvents.eventId, event.eventId));
      await tx.insert(financialAuditLogs).values({ action: "POSTING_EXCEPTION", recordType: "SOURCE_EVENT", recordId: event.eventId, details: { eventType: event.eventType, sourceId, code: error.code, message: error.message } });
    }
  });
}

export async function retryFinancialEvent(eventId: string) {
  const [record] = await db.select().from(financialProcessedEvents).where(eq(financialProcessedEvents.eventId, eventId)).limit(1);
  if (!record) throw new Error("Financial event was not found");
  if (record.status === "POSTED") return { status: "POSTED", journalId: record.journalId };
  await processFinancialEvent(record.payload);
  const [updated] = await db.select({ status: financialProcessedEvents.status, journalId: financialProcessedEvents.journalId, lastError: financialProcessedEvents.lastError }).from(financialProcessedEvents).where(eq(financialProcessedEvents.eventId, eventId)).limit(1);
  return updated;
}

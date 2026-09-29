import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { and, eq, gt, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { salesAuditLogs, salesAuditProcessedEvents, salesAuditSessions, salesAuditTransactionTenders, salesAuditTransactions } from "../../db/schema/sales-audit.js";
import { getRabbitMQChannel } from "./rabbitmq.js";

const uuid = z.uuid();
const tenderSchema = z.object({ id: uuid, method: z.enum(["CASH", "CARD", "GIFT_CARD"]), amountMinor: z.number().int().positive(), outcome: z.enum(["RECORDED", "SUCCEEDED"]) });
const completedSchema = z.object({
  eventId: uuid, eventType: z.literal("SaleCompleted"), aggregateType: z.literal("Sale"), aggregateId: uuid, occurredAt: z.iso.datetime(),
  payload: z.object({ schemaVersion: z.literal(1), saleId: uuid, receiptNumber: z.string().min(1), registerId: uuid, actorId: uuid, locationId: uuid, currency: z.string().length(3), completedAt: z.iso.datetime(), totalMinor: z.number().int().nonnegative(), tenders: z.array(tenderSchema).min(1) }),
}).superRefine((event, ctx) => {
  if (event.aggregateId !== event.payload.saleId) ctx.addIssue({ code: "custom", path: ["aggregateId"], message: "Sale aggregate ID must match saleId." });
  if (event.payload.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0) !== event.payload.totalMinor) ctx.addIssue({ code: "custom", path: ["payload", "tenders"], message: "Sale tender amounts must equal totalMinor." });
});
const returnedSchema = z.object({
  eventId: uuid, eventType: z.literal("SaleReturned"), aggregateType: z.literal("Sale"), aggregateId: uuid, occurredAt: z.iso.datetime(),
  payload: z.object({ schemaVersion: z.literal(1), returnId: uuid, saleId: uuid, receiptNumber: z.string().min(1), registerId: uuid, actorId: uuid, locationId: uuid, currency: z.string().length(3), returnedAt: z.iso.datetime(), totalRefundMinor: z.number().int().nonnegative(), tenders: z.array(tenderSchema).min(1) }),
}).superRefine((event, ctx) => {
  if (event.aggregateId !== event.payload.saleId) ctx.addIssue({ code: "custom", path: ["aggregateId"], message: "Sale aggregate ID must match saleId." });
  if (event.payload.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0) !== event.payload.totalRefundMinor) ctx.addIssue({ code: "custom", path: ["payload", "tenders"], message: "Refund tender amounts must equal totalRefundMinor." });
});
const eventSchema = z.discriminatedUnion("eventType", [completedSchema, returnedSchema]);

async function persistEvent(event: z.infer<typeof eventSchema>) {
  const isSale = event.eventType === "SaleCompleted";
  const payload = event.payload;
  const occurredAt = new Date("completedAt" in payload ? payload.completedAt : payload.returnedAt);
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(salesAuditProcessedEvents).values({ eventId: event.eventId, eventType: event.eventType }).onConflictDoNothing({ target: salesAuditProcessedEvents.eventId }).returning({ eventId: salesAuditProcessedEvents.eventId });
    if (!inserted) return;
    const transactionId = "returnId" in payload ? payload.returnId : payload.saleId;
    const [transaction] = await tx.insert(salesAuditTransactions).values({
      sourceEventId: event.eventId, sourceEventType: event.eventType, transactionId,
      originalSaleId: isSale ? null : payload.saleId, receiptNumber: payload.receiptNumber,
      registerId: payload.registerId, locationId: payload.locationId, actorId: payload.actorId,
      currency: payload.currency, direction: isSale ? "SALE" : "REFUND", occurredAt,
    }).returning({ id: salesAuditTransactions.id });
    if (!transaction) throw new Error("Sales Audit transaction projection was not created");
    for (const tender of payload.tenders) await tx.insert(salesAuditTransactionTenders).values({ transactionRecordId: transaction.id, sourceTenderId: tender.id, method: tender.method, amountMinor: tender.amountMinor, outcome: tender.outcome });

    const [session] = await tx.select().from(salesAuditSessions).where(and(
      eq(salesAuditSessions.registerId, payload.registerId),
      lte(salesAuditSessions.openedAt, occurredAt),
      or(isNull(salesAuditSessions.closedAt), gt(salesAuditSessions.closedAt, occurredAt)),
    )).orderBy(salesAuditSessions.openedAt).limit(1).for("update");
    if (!session || (session.closedAt && occurredAt >= session.closedAt)) return;
    if (session.status === "SUBMITTED" || session.status === "REJECTED" || session.status === "EXCEPTION") {
      await tx.update(salesAuditSessions).set({ status: "EXCEPTION", reconciliationStatus: "PENDING", updatedAt: new Date() }).where(eq(salesAuditSessions.id, session.id));
      await tx.insert(salesAuditLogs).values({ sessionId: session.id, action: "LATE_TRANSACTION_RECEIVED", actorId: payload.actorId, details: { transactionId, sourceEventId: event.eventId, occurredAt } });
    } else if (session.status === "APPROVED") {
      await tx.update(salesAuditSessions).set({ reconciliationStatus: "MISMATCH", updatedAt: new Date() }).where(eq(salesAuditSessions.id, session.id));
      await tx.insert(salesAuditLogs).values({ sessionId: session.id, action: "TRANSACTION_RECEIVED_AFTER_APPROVAL", actorId: payload.actorId, details: { transactionId, sourceEventId: event.eventId, occurredAt } });
    }
  });
}

const EVENTS_EXCHANGE = "mms.events";
const EVENT_TYPES = ["SaleCompleted", "SaleReturned"] as const;
const QUEUE_NAME = `${env.RABBITMQ_QUEUE_PREFIX}sales-audit.retail-sales`;
const RETRY_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.retry`;
const DEAD_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.dead-letter`;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;
let consuming = false;
let stopping = false;
let consumerTag: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function retryCount(message: ConsumeMessage) {
  const deaths = message.properties.headers?.["x-death"];
  return Array.isArray(deaths) ? deaths.filter((death) => death.queue === QUEUE_NAME).reduce((sum, death) => sum + Number(death.count ?? 0), 0) : 0;
}

async function setup(channel: ConfirmChannel) {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(RETRY_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DEAD_EXCHANGE, "topic", { durable: true });
  const deadQueue = `${QUEUE_NAME}.dead-letter`;
  await channel.assertQueue(deadQueue, { durable: true });
  for (const type of EVENT_TYPES) await channel.bindQueue(deadQueue, DEAD_EXCHANGE, type);
  await channel.assertQueue(QUEUE_NAME, { durable: true, arguments: { "x-dead-letter-exchange": RETRY_EXCHANGE } });
  for (const type of EVENT_TYPES) {
    await channel.bindQueue(QUEUE_NAME, EVENTS_EXCHANGE, type);
    const retryQueue = `${QUEUE_NAME}.retry.${type}`;
    await channel.assertQueue(retryQueue, { durable: true, arguments: { "x-message-ttl": RETRY_DELAY_MS, "x-dead-letter-exchange": EVENTS_EXCHANGE } });
    await channel.bindQueue(retryQueue, RETRY_EXCHANGE, type);
  }
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void startSalesAuditConsumer(); }, RETRY_DELAY_MS);
}

export async function startSalesAuditConsumer() {
  if (consuming || stopping) return;
  try {
    const channel = await getRabbitMQChannel();
    await setup(channel);
    channel.once("close", () => { consumerTag = null; consuming = false; scheduleReconnect(); });
    const result = await channel.consume(QUEUE_NAME, async (message) => {
      if (!message) return;
      try {
        const event = eventSchema.parse(JSON.parse(message.content.toString()));
        await persistEvent(event);
        channel.ack(message);
      } catch (error) {
        console.error("Sales Audit could not process a Retail Sales event:", error);
        if (retryCount(message) >= MAX_RETRIES) {
          channel.publish(DEAD_EXCHANGE, message.fields.routingKey, message.content, { ...message.properties, persistent: true, headers: { ...message.properties.headers, "x-last-error": "Sales Audit failed to process the event after retries" } });
          await channel.waitForConfirms();
          channel.ack(message);
        } else channel.nack(message, false, false);
      }
    });
    consumerTag = result.consumerTag;
    consuming = true;
    console.log(`Sales Audit consumer listening on ${QUEUE_NAME}`);
  } catch (error) {
    console.error("Could not start Sales Audit event consumer:", error);
    scheduleReconnect();
  }
}

export async function stopSalesAuditConsumer() {
  stopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (!consumerTag) { consuming = false; return; }
  const channel = await getRabbitMQChannel();
  try { await channel.cancel(consumerTag); }
  finally { consumerTag = null; consuming = false; }
}

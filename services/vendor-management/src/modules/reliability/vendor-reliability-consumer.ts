import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getRabbitMQChannel } from "../events/rabbitmq.js";
import {
  recordGoodsReceived,
  recordPurchaseOrderCancelled,
  recordPurchaseOrderSent,
} from "./vendor-reliability.repository.js";

const EVENTS_EXCHANGE = "mms.events";
const EVENT_TYPES = ["PurchaseOrderSent", "PurchaseOrderCancelled", "GoodsReceived"] as const;
const QUEUE_NAME = `${env.RABBITMQ_QUEUE_PREFIX}vendor-management.supplier-reliability`;
const RETRY_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.retry`;
const DEAD_LETTER_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.dead-letter`;
const DEAD_LETTER_QUEUE = `${QUEUE_NAME}.dead-letter`;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 3;

const envelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.enum(EVENT_TYPES),
  payload: z.unknown(),
  occurredAt: z.iso.datetime(),
});

const purchaseOrderSentSchema = z.object({
  purchaseOrderId: z.uuid(),
  vendorId: z.uuid(),
  poNumber: z.string().min(1).max(50),
  sentAt: z.iso.datetime(),
  lines: z.array(z.object({
    purchaseOrderLineId: z.uuid(),
    productId: z.uuid(),
    quantityOrdered: z.number().int().positive(),
    leadTimeDaysSnapshot: z.number().int().nonnegative().nullable(),
  })).min(1),
});

const goodsReceivedSchema = z.object({
  goodsReceiptId: z.uuid(),
  purchaseOrderId: z.uuid(),
  vendorId: z.uuid(),
  lines: z.array(z.object({
    purchaseOrderLineId: z.uuid().nullable(),
    quantityObserved: z.number().int().nonnegative(),
    quantityDamaged: z.number().int().nonnegative(),
    quantityAccepted: z.number().int().nonnegative(),
  })).min(1),
});

let isConsuming = false;
let isStopping = false;
let consumerTag: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getRetryQueueName(eventType: typeof EVENT_TYPES[number]) {
  return `${QUEUE_NAME}.retry.${eventType}`;
}

function retryCount(message: ConsumeMessage) {
  const deaths = message.properties.headers?.["x-death"];
  if (!Array.isArray(deaths)) return 0;
  return deaths
    .filter((death) => death.queue === QUEUE_NAME)
    .reduce((count, death) => count + Number(death.count ?? 0), 0);
}

async function setupTopology(channel: ConfirmChannel) {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(RETRY_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "#");
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: { "x-dead-letter-exchange": RETRY_EXCHANGE },
  });

  for (const eventType of EVENT_TYPES) {
    await channel.bindQueue(QUEUE_NAME, EVENTS_EXCHANGE, eventType);
    await channel.assertQueue(getRetryQueueName(eventType), {
      durable: true,
      arguments: {
        "x-message-ttl": RETRY_DELAY_MS,
        "x-dead-letter-exchange": EVENTS_EXCHANGE,
      },
    });
    await channel.bindQueue(getRetryQueueName(eventType), RETRY_EXCHANGE, eventType);
  }
}

async function sendToDeadLetterQueue(channel: ConfirmChannel, message: ConsumeMessage) {
  channel.publish(DEAD_LETTER_EXCHANGE, message.fields.routingKey, message.content, {
    ...message.properties,
    persistent: true,
    headers: {
      ...message.properties.headers,
      "x-last-error": "Vendor reliability event processing failed after retries",
    },
  });
  await channel.waitForConfirms();
  channel.ack(message);
}

async function processMessage(message: ConsumeMessage) {
  const envelope = envelopeSchema.parse(JSON.parse(message.content.toString()));
  switch (envelope.eventType) {
    case "PurchaseOrderSent":
      await recordPurchaseOrderSent(purchaseOrderSentSchema.parse(envelope.payload));
      return;
    case "GoodsReceived": {
      const payload = goodsReceivedSchema.parse(envelope.payload);
      await recordGoodsReceived({
        ...payload,
        receivedAt: envelope.occurredAt,
      });
      return;
    }
    case "PurchaseOrderCancelled": {
      const payload = z.object({ purchaseOrderId: z.uuid() }).parse(envelope.payload);
      await recordPurchaseOrderCancelled(payload.purchaseOrderId, envelope.occurredAt);
    }
  }
}

function scheduleReconnect() {
  if (isStopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startVendorReliabilityConsumer();
  }, RETRY_DELAY_MS);
}

export async function startVendorReliabilityConsumer() {
  if (isConsuming || isStopping) return;
  try {
    const channel = await getRabbitMQChannel();
    await setupTopology(channel);
    channel.once("close", () => {
      consumerTag = null;
      isConsuming = false;
      scheduleReconnect();
    });
    const result = await channel.consume(QUEUE_NAME, async (message) => {
      if (!message) return;
      try {
        await processMessage(message);
        channel.ack(message);
      } catch (error) {
        console.error("Failed to process supplier reliability event:", error);
        if (retryCount(message) >= MAX_RETRIES) {
          await sendToDeadLetterQueue(channel, message);
          return;
        }
        channel.nack(message, false, false);
      }
    });
    consumerTag = result.consumerTag;
    isConsuming = true;
    console.log(`Vendor reliability consumer listening on ${QUEUE_NAME}`);
  } catch (error) {
    console.error("Could not start Vendor reliability consumer:", error);
    scheduleReconnect();
  }
}

export async function stopVendorReliabilityConsumer() {
  isStopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (!consumerTag) {
    isConsuming = false;
    return;
  }
  const channel = await getRabbitMQChannel();
  try {
    await channel.cancel(consumerTag);
  } finally {
    consumerTag = null;
    isConsuming = false;
  }
}

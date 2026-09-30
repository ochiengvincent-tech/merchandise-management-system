import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  recordGoodsReceivedEvent,
  recordInventoryStockAdjustedEvent,
} from "./warehouse-event-repository.js";
import { getRabbitMQChannel } from "./rabbitmq.js";

const EVENTS_EXCHANGE = "mms.events";
const EVENT_TYPES = ["GoodsReceived", "InventoryStockAdjusted"] as const;
const QUEUE_NAME = `${env.RABBITMQ_QUEUE_PREFIX}warehouse-operations.goods-received`;
const RETRY_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.retry`;
const DEAD_LETTER_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.dead-letter`;
const DEAD_LETTER_QUEUE = `${QUEUE_NAME}.dead-letter`;
const RETRY_QUEUE = `${QUEUE_NAME}.retry`;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 3;

const goodsReceivedSchema = z.object({
  eventId: z.uuid(), eventType: z.literal("GoodsReceived"),
  aggregateType: z.literal("GoodsReceipt"), aggregateId: z.uuid(), occurredAt: z.iso.datetime(),
  payload: z.object({
    goodsReceiptId: z.uuid(), grnNumber: z.string().min(1).max(50),
    purchaseOrderId: z.uuid(), vendorId: z.uuid(), destinationLocationId: z.uuid(), receivedBy: z.uuid(),
    lines: z.array(z.object({
      purchaseOrderLineId: z.uuid().nullable(), productId: z.uuid(),
      quantityObserved: z.number().int().nonnegative(), quantityDamaged: z.number().int().nonnegative(),
      quantityAccepted: z.number().int().nonnegative(), unitPrice: z.number().nonnegative(),
    })).min(1),
  }),
});
const inventoryStockAdjustedSchema = z.object({
  eventId: z.uuid(), eventType: z.literal("InventoryStockAdjusted"),
  aggregateType: z.literal("InventoryAdjustment"), aggregateId: z.uuid(), occurredAt: z.iso.datetime(),
  payload: z.object({
    adjustmentId: z.uuid(), warehouseCommandId: z.uuid(), productId: z.uuid(),
    locationId: z.uuid(), sourceBinId: z.uuid(), quantityChange: z.number().int().refine((value) => value !== 0), actorId: z.uuid(),
  }),
});
const messageSchema = z.discriminatedUnion("eventType", [goodsReceivedSchema, inventoryStockAdjustedSchema]);

let isConsuming = false;
let isStopping = false;
let consumerTag: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getRetryCount(message: ConsumeMessage) {
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
  for (const eventType of EVENT_TYPES) {
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, eventType);
  }
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: { "x-dead-letter-exchange": RETRY_EXCHANGE },
  });
  for (const eventType of EVENT_TYPES) {
    await channel.bindQueue(QUEUE_NAME, EVENTS_EXCHANGE, eventType);
  }
  for (const eventType of EVENT_TYPES) {
    await channel.assertQueue(`${RETRY_QUEUE}.${eventType}`, {
      durable: true,
      arguments: { "x-message-ttl": RETRY_DELAY_MS, "x-dead-letter-exchange": EVENTS_EXCHANGE },
    });
    await channel.bindQueue(`${RETRY_QUEUE}.${eventType}`, RETRY_EXCHANGE, eventType);
  }
}

async function deadLetter(channel: ConfirmChannel, message: ConsumeMessage) {
  channel.publish(DEAD_LETTER_EXCHANGE, message.fields.routingKey, message.content, {
    ...message.properties,
    persistent: true,
    headers: {
      ...message.properties.headers,
      "x-last-error": "Warehouse failed to process an event after retries",
    },
  });
  await channel.waitForConfirms();
  channel.ack(message);
}

async function processMessage(message: ConsumeMessage) {
  const event = messageSchema.parse(JSON.parse(message.content.toString()));
  if (event.eventType === "GoodsReceived") {
    await recordGoodsReceivedEvent({ eventId: event.eventId, occurredAt: event.occurredAt, payload: event.payload });
    return;
  }
  await recordInventoryStockAdjustedEvent({ eventId: event.eventId, occurredAt: event.occurredAt, payload: event.payload });
}

function scheduleReconnect() {
  if (isStopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startWarehouseConsumer();
  }, RETRY_DELAY_MS);
}

export async function startWarehouseConsumer() {
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
        console.error("Failed to process GoodsReceived for Warehouse:", error);
        if (getRetryCount(message) >= MAX_RETRIES) {
          await deadLetter(channel, message);
          return;
        }
        channel.nack(message, false, false);
      }
    });
    consumerTag = result.consumerTag;
    isConsuming = true;
    console.log(`Warehouse consumer listening on ${QUEUE_NAME}`);
  } catch (error) {
    console.error("Could not start Warehouse event consumer:", error);
    scheduleReconnect();
  }
}

export async function stopWarehouseConsumer() {
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

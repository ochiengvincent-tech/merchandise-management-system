import type { ConsumeMessage } from "amqplib";

import { getRabbitMQChannel } from "./rabbitmq.js";
import { createReorderSuggestion } from "../reorder-suggestions/reorder-suggestion-service.js";

const EVENTS_EXCHANGE = "mms.events";
const STOCK_LOW_QUEUE = "procurement.stock-low";

const DEAD_LETTER_EXCHANGE = "mms.dead-letter";
const DEAD_LETTER_QUEUE = "procurement.stock-low.dead-letter";

const RETRY_EXCHANGE = "mms.retry";
const RETRY_QUEUE = "procurement.stock-low.retry";

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;

type EventEnvelope = {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: string;
};

type StockLowEvent = {
  eventId: string;
  eventType: "StockLow";
  productId: string;
  locationId: string;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  reorderLevel: number;
};

function parseStockLowEvent(message: ConsumeMessage): StockLowEvent {
  const envelope = JSON.parse(message.content.toString()) as EventEnvelope;

  if (envelope.eventType !== "StockLow") {
    throw new Error(`Unsupported event type: ${envelope.eventType}`);
  }

  return {
    ...(envelope.payload as Omit<StockLowEvent, "eventId" | "eventType">),
    eventId: envelope.eventId,
    eventType: "StockLow",
  };
}

function getRetryCount(message: ConsumeMessage) {
  const xDeath = message.properties.headers?.["x-death"];

  if (!Array.isArray(xDeath)) {
    return 0;
  }

  const death = xDeath.find((entry) => entry.queue === STOCK_LOW_QUEUE);

  return typeof death?.count === "number" ? death.count : 0;
}

async function setupTopology() {
  const channel = await getRabbitMQChannel();

  await channel.assertExchange(EVENTS_EXCHANGE, "topic", {
    durable: true,
  });

  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", {
    durable: true,
  });

  await channel.assertExchange(RETRY_EXCHANGE, "topic", {
    durable: true,
  });

  await channel.assertQueue(DEAD_LETTER_QUEUE, {
    durable: true,
  });

  await channel.bindQueue(
    DEAD_LETTER_QUEUE,
    DEAD_LETTER_EXCHANGE,
    STOCK_LOW_QUEUE,
  );

  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      "x-message-ttl": RETRY_DELAY_MS,
      "x-dead-letter-exchange": EVENTS_EXCHANGE,
      "x-dead-letter-routing-key": "StockLow",
    },
  });

  await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, STOCK_LOW_QUEUE);

  await channel.assertQueue(STOCK_LOW_QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": RETRY_EXCHANGE,
      "x-dead-letter-routing-key": STOCK_LOW_QUEUE,
    },
  });

  await channel.bindQueue(STOCK_LOW_QUEUE, EVENTS_EXCHANGE, "StockLow");

  return channel;
}

export async function startRabbitMQConsumer() {
  const channel = await setupTopology();

  await channel.consume(STOCK_LOW_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const event = parseStockLowEvent(message);

      await createReorderSuggestion(event);

      channel.ack(message);
    } catch (error) {
      const retryCount = getRetryCount(message);

      console.error(
        `Failed to process StockLow event. Retry ${retryCount}/${MAX_RETRIES}:`,
        error,
      );

      if (retryCount >= MAX_RETRIES) {
        const published = channel.publish(
          DEAD_LETTER_EXCHANGE,
          STOCK_LOW_QUEUE,
          message.content,
          {
            persistent: true,
            contentType: message.properties.contentType,
            messageId: message.properties.messageId,
            headers: {
              ...message.properties.headers,
              "x-last-error":
                error instanceof Error ? error.message : String(error),
            },
          },
        );

        if (!published) {
          throw new Error("Failed to publish StockLow event to DLQ");
        }

        await channel.waitForConfirms();

        channel.ack(message);
        return;
      }

      channel.nack(message, false, false);
    }
  });
}

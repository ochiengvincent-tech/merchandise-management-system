import type { ConfirmChannel, ConsumeMessage } from "amqplib";

import { env } from "../../config/env.js";
import { getRabbitMqChannel, EXCHANGE_NAME } from "./rabbitmq.js";
import {
  processPurchaseOrderApproved,
  processPurchaseOrderCancelled,
  processPurchaseOrderReceived,
} from "./purchase-order-event-service.js";

const QUEUE_NAME = `${env.RABBITMQ_QUEUE_PREFIX}inventory.purchase-orders`;
const DEAD_LETTER_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.dead-letter`;
const DEAD_LETTER_QUEUE = `${env.RABBITMQ_QUEUE_PREFIX}inventory.purchase-orders.dead-letter`;
const RETRY_EXCHANGE = `${env.RABBITMQ_QUEUE_PREFIX}mms.retry`;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 3;

const EVENT_TYPES = [
  "PurchaseOrderApproved",
  "PurchaseOrderCancelled",
  "PurchaseOrderReceived",
] as const;

let isConsuming = false;

type PurchaseOrderEventEnvelope = {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

const retryQueueName = (eventType: string) =>
  `inventory.purchase-orders.retry.${eventType}`;

const retryCount = (message: ConsumeMessage) => {
  const deaths = message.properties.headers?.["x-death"];

  if (!Array.isArray(deaths)) {
    return 0;
  }

  return deaths
    .filter((death) => death.queue === QUEUE_NAME)
    .reduce((total, death) => total + Number(death.count ?? 0), 0);
};

const setupTopology = async (channel: ConfirmChannel) => {
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", {
    durable: true,
  });
  await channel.assertExchange(RETRY_EXCHANGE, "topic", {
    durable: true,
  });

  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "#");

  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": RETRY_EXCHANGE,
    },
  });

  for (const eventType of EVENT_TYPES) {
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, eventType);
    await channel.assertQueue(retryQueueName(eventType), {
      durable: true,
      arguments: {
        "x-message-ttl": RETRY_DELAY_MS,
        "x-dead-letter-exchange": EXCHANGE_NAME,
      },
    });
    await channel.bindQueue(
      retryQueueName(eventType),
      RETRY_EXCHANGE,
      eventType,
    );
  }
};

const sendToDeadLetterQueue = async (
  channel: ConfirmChannel,
  message: ConsumeMessage,
) => {
  channel.publish(
    DEAD_LETTER_EXCHANGE,
    message.fields.routingKey,
    message.content,
    {
      ...message.properties,
      persistent: true,
      headers: {
        ...message.properties.headers,
        "x-last-error": "Inventory event processing failed after retries",
      },
    },
  );
  await channel.waitForConfirms();
  channel.ack(message);
};

export const startRabbitMqConsumer = async () => {
  if (isConsuming) {
    return;
  }

  const channel = await getRabbitMqChannel();
  await setupTopology(channel);
  channel.once("close", () => {
    isConsuming = false;
    setTimeout(() => {
      void startRabbitMqConsumer().catch((error) => {
        console.error(
          "Failed to reconnect Inventory RabbitMQ consumer:",
          error,
        );
      });
    }, RETRY_DELAY_MS);
  });

  await channel.consume(QUEUE_NAME, async (message: ConsumeMessage | null) => {
    if (!message) {
      return;
    }

    try {
      const envelope = JSON.parse(
        message.content.toString(),
      ) as PurchaseOrderEventEnvelope;

      const event = {
        ...envelope.payload,
        eventId: envelope.eventId,
        eventType: envelope.eventType,
      };

      switch (envelope.eventType) {
        case "PurchaseOrderApproved":
          await processPurchaseOrderApproved(event);
          break;

        case "PurchaseOrderCancelled":
          await processPurchaseOrderCancelled(event);
          break;

        case "PurchaseOrderReceived":
          await processPurchaseOrderReceived(event);
          break;

        default:
          await sendToDeadLetterQueue(channel, message);
          return;
      }

      channel.ack(message);
    } catch (error) {
      console.error("Failed to process RabbitMQ event:", error);

      if (retryCount(message) >= MAX_RETRIES) {
        await sendToDeadLetterQueue(channel, message);
        return;
      }

      channel.nack(message, false, false);
    }
  });

  isConsuming = true;

  console.log(`Inventory RabbitMQ consumer listening on ${QUEUE_NAME}`);
};

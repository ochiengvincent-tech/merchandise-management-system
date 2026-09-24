import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { env } from "../../src/config/env.js";
import { db } from "../../src/db/index.js";
import { reorderSuggestions } from "../../src/db/schema/index.js";
import { startRabbitMQConsumer } from "../../src/modules/events/rabbitmq-consumer.js";

const EXCHANGE_NAME = "mms.events";
const DEAD_LETTER_QUEUE = "procurement.stock-low.dead-letter";

const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";

let connection: Awaited<ReturnType<typeof amqp.connect>>;
let channel: Awaited<
  ReturnType<
    Awaited<ReturnType<typeof amqp.connect>>["createConfirmChannel"]
  >
>;

beforeAll(async () => {
  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createConfirmChannel();

  await startRabbitMQConsumer();
});

afterAll(async () => {
  await channel.close();
  await connection.close();
});

describe("Procurement RabbitMQ consumer", () => {
  it("creates a reorder suggestion from a StockLow event", async () => {
    const eventId = randomUUID();

    const event = {
      eventId,
      eventType: "StockLow",
      aggregateType: "PRODUCT",
      aggregateId: PRODUCT_ID,
      payload: {
        eventId,
        eventType: "StockLow",
        productId: PRODUCT_ID,
        locationId: LOCATION_ID,
        quantityOnHand: 10,
        quantityAllocated: 3,
        quantityAvailable: 7,
        reorderLevel: 20,
      },
      occurredAt: new Date().toISOString(),
    };

    await channel.purgeQueue(DEAD_LETTER_QUEUE);

    channel.publish(
      EXCHANGE_NAME,
      "StockLow",
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: eventId,
      },
    );

    await channel.waitForConfirms();

    let suggestion;

    for (let attempt = 0; attempt < 20; attempt++) {
      const [result] = await db
        .select()
        .from(reorderSuggestions)
        .where(eq(reorderSuggestions.eventId, eventId));

      suggestion = result;

      if (suggestion) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(suggestion).toMatchObject({
      eventId,
      productId: PRODUCT_ID,
      locationId: LOCATION_ID,
      quantityOnHand: 10,
      quantityAllocated: 3,
      quantityAvailable: 7,
      reorderLevel: 20,
      suggestedQuantity: 13,
      status: "PENDING",
    });
  });

  it("processes the same StockLow event without creating a duplicate suggestion", async () => {
    const eventId = randomUUID();

    const event = {
      eventId,
      eventType: "StockLow",
      aggregateType: "PRODUCT",
      aggregateId: PRODUCT_ID,
      payload: {
        eventId,
        eventType: "StockLow",
        productId: PRODUCT_ID,
        locationId: LOCATION_ID,
        quantityOnHand: 10,
        quantityAllocated: 3,
        quantityAvailable: 7,
        reorderLevel: 20,
      },
      occurredAt: new Date().toISOString(),
    };

    const message = Buffer.from(JSON.stringify(event));

    channel.publish(EXCHANGE_NAME, "StockLow", message, {
      persistent: true,
      contentType: "application/json",
      messageId: eventId,
    });

    channel.publish(EXCHANGE_NAME, "StockLow", message, {
      persistent: true,
      contentType: "application/json",
      messageId: eventId,
    });

    await channel.waitForConfirms();

    let suggestions: (typeof reorderSuggestions.$inferSelect)[] = [];

    for (let attempt = 0; attempt < 20; attempt++) {
      suggestions = await db
        .select()
        .from(reorderSuggestions)
        .where(eq(reorderSuggestions.eventId, eventId));

      if (suggestions.length === 1) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestedQuantity).toBe(13);
  });

  it("moves a failed StockLow event to the dead-letter queue", async () => {
    await channel.purgeQueue(DEAD_LETTER_QUEUE);

    const event = {
      eventId: randomUUID(),
      eventType: "StockLow",
      aggregateType: "PRODUCT",
      aggregateId: randomUUID(),
      payload: {
        eventId: randomUUID(),
        eventType: "StockLow",
        productId: "not-a-uuid",
        locationId: LOCATION_ID,
        quantityOnHand: 10,
        quantityAllocated: 3,
        quantityAvailable: 7,
        reorderLevel: 20,
      },
      occurredAt: new Date().toISOString(),
    };

    channel.publish(
      EXCHANGE_NAME,
      "StockLow",
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: event.eventId,
      },
    );

    await channel.waitForConfirms();

    let messageId: string | undefined;
    let lastError: unknown;
    let deadLetterEvent:
      | {
          eventId: string;
          eventType: string;
        }
      | undefined;

    for (let attempt = 0; attempt < 30; attempt++) {
      const message = await channel.get(DEAD_LETTER_QUEUE, {
        noAck: true,
      });

      if (message) {
        const candidate = JSON.parse(
          message.content.toString(),
        ) as {
          eventId: string;
          eventType: string;
        };

        if (candidate.eventId === event.eventId) {
          messageId = message.properties.messageId;
          lastError =
            message.properties.headers?.["x-last-error"];
          deadLetterEvent = candidate;
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(messageId).toBe(event.eventId);

    expect(lastError).toBe(
      "Failed to process StockLow event",
    );

    expect(deadLetterEvent?.eventId).toBe(event.eventId);
    expect(deadLetterEvent?.eventType).toBe("StockLow");
  });
});
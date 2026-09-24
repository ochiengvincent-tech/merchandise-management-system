import { describe, expect, it, afterAll, beforeAll } from "vitest";
import amqp from "amqplib";
import { randomUUID } from "node:crypto";

import { env } from "../src/config/env.js";
import { api, createLocation, createProduct, createStock } from "./helpers.js";
import {
  startRabbitMqConsumer,
  stopRabbitMqConsumer,
} from "../src/modules/events/rabbitmq-consumer.js";
import { closeRabbitMq } from "../src/modules/events/rabbitmq.js";

const EXCHANGE_NAME = "mms.events";
const DEAD_LETTER_QUEUE = "test.inventory.purchase-orders.dead-letter";

let connection: Awaited<ReturnType<typeof amqp.connect>>;
let channel: Awaited<
  ReturnType<Awaited<ReturnType<typeof amqp.connect>>["createConfirmChannel"]>
>;

beforeAll(async () => {
  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createConfirmChannel();

  await startRabbitMqConsumer();
});

afterAll(async () => {
  await stopRabbitMqConsumer();
  await closeRabbitMq();
  await channel.close();
  await connection.close();
});

describe("RabbitMQ consumer", () => {
  it("processes PurchaseOrderApproved events from RabbitMQ", async () => {
    const product = await createProduct();
    const location = await createLocation();

    await createStock(product.id, location.id);

    const eventId = randomUUID();
    const purchaseOrderId = randomUUID();

    const event = {
      eventId,
      eventType: "PurchaseOrderApproved",
      aggregateType: "PURCHASE_ORDER",
      aggregateId: purchaseOrderId,
      payload: {
        purchaseOrderId,
        lines: [
          {
            productId: product.id,
            locationId: location.id,
            quantityOrdered: 8,
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };

    channel.publish(
      EXCHANGE_NAME,
      "PurchaseOrderApproved",
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: eventId,
      },
    );

    await channel.waitForConfirms();

    let quantityOnOrder = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await api
        .get("/api/v1/stock/by-product-and-location")
        .query({
          productId: product.id,
          locationId: location.id,
        });

      quantityOnOrder = response.body.quantityOnOrder;

      if (quantityOnOrder === 8) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(quantityOnOrder).toBe(8);
  });

  it("processes PurchaseOrderReceived events from RabbitMQ", async () => {
    const product = await createProduct();
    const location = await createLocation();

    await createStock(product.id, location.id);

    const approvedEventId = randomUUID();
    const purchaseOrderId = randomUUID();

    const approvedEvent = {
      eventId: approvedEventId,
      eventType: "PurchaseOrderApproved",
      aggregateType: "PURCHASE_ORDER",
      aggregateId: purchaseOrderId,
      payload: {
        purchaseOrderId,
        lines: [
          {
            productId: product.id,
            locationId: location.id,
            quantityOrdered: 10,
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };

    channel.publish(
      EXCHANGE_NAME,
      "PurchaseOrderApproved",
      Buffer.from(JSON.stringify(approvedEvent)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: approvedEventId,
      },
    );

    await channel.waitForConfirms();

    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await api
        .get("/api/v1/stock/by-product-and-location")
        .query({
          productId: product.id,
          locationId: location.id,
        });

      if (response.body.quantityOnOrder === 10) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const receivedEventId = randomUUID();

    const receivedEvent = {
      eventId: receivedEventId,
      eventType: "PurchaseOrderReceived",
      aggregateType: "PURCHASE_ORDER",
      aggregateId: purchaseOrderId,
      payload: {
        purchaseOrderId,
        lines: [
          {
            productId: product.id,
            locationId: location.id,
            quantityReceived: 4,
            unitPrice: 60,
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };

    channel.publish(
      EXCHANGE_NAME,
      "PurchaseOrderReceived",
      Buffer.from(JSON.stringify(receivedEvent)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: receivedEventId,
      },
    );

    await channel.waitForConfirms();

    let stock;

    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await api
        .get("/api/v1/stock/by-product-and-location")
        .query({
          productId: product.id,
          locationId: location.id,
        });

      stock = response.body;

      if (stock.quantityOnOrder === 6 && stock.quantityOnHand === 4) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(stock.quantityOnOrder).toBe(6);
    expect(stock.quantityOnHand).toBe(4);
  });

  it("processes the same RabbitMQ event only once", async () => {
    const product = await createProduct();
    const location = await createLocation();

    await createStock(product.id, location.id);

    const eventId = randomUUID();
    const purchaseOrderId = randomUUID();

    const event = {
      eventId,
      eventType: "PurchaseOrderApproved",
      aggregateType: "PURCHASE_ORDER",
      aggregateId: purchaseOrderId,
      payload: {
        purchaseOrderId,
        lines: [
          {
            productId: product.id,
            locationId: location.id,
            quantityOrdered: 8,
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };

    const message = Buffer.from(JSON.stringify(event));

    channel.publish(EXCHANGE_NAME, "PurchaseOrderApproved", message, {
      persistent: true,
      contentType: "application/json",
      messageId: eventId,
    });

    channel.publish(EXCHANGE_NAME, "PurchaseOrderApproved", message, {
      persistent: true,
      contentType: "application/json",
      messageId: eventId,
    });

    await channel.waitForConfirms();

    let quantityOnOrder = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await api
        .get("/api/v1/stock/by-product-and-location")
        .query({
          productId: product.id,
          locationId: location.id,
        });

      quantityOnOrder = response.body.quantityOnOrder;

      if (quantityOnOrder === 8) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(quantityOnOrder).toBe(8);
  });

  it("moves a failed event to the dead-letter queue with failure metadata", async () => {
    await channel.purgeQueue(DEAD_LETTER_QUEUE);

    const event = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderApproved",
      aggregateType: "PURCHASE_ORDER",
      aggregateId: randomUUID(),
      payload: {
        purchaseOrderId: randomUUID(),
        lines: [
          {
            productId: "not-a-uuid",
            locationId: randomUUID(),
            quantityOrdered: 8,
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };

    channel.publish(
      EXCHANGE_NAME,
      "PurchaseOrderApproved",
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
      const message = await channel.get(DEAD_LETTER_QUEUE, { noAck: true });

      if (message) {
        const candidate = JSON.parse(message.content.toString()) as {
          eventId: string;
          eventType: string;
        };

        if (candidate.eventId === event.eventId) {
          messageId = message.properties.messageId;
          lastError = message.properties.headers?.["x-last-error"];
          deadLetterEvent = candidate;
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(messageId).toBe(event.eventId);
    expect(lastError).toBe("Inventory event processing failed after retries");
    expect(deadLetterEvent?.eventId).toBe(event.eventId);
    expect(deadLetterEvent?.eventType).toBe("PurchaseOrderApproved");
  });
});

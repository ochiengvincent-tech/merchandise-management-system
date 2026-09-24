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

    const deadLetterResult = new Promise<{
      messageId: string | undefined;
      lastError: unknown;
      eventId: string;
      eventType: string;
    }>((resolve, reject) => {
      let consumerTag: string | undefined;

      const timeout = setTimeout(() => {
        if (!consumerTag) {
          reject(
            new Error("Timed out waiting for dead-letter consumer to start"),
          );
          return;
        }

        void channel.cancel(consumerTag).catch(() => undefined);

        reject(
          new Error(
            "Timed out waiting for failed event to reach the dead-letter queue",
          ),
        );
      }, 25_000);

      void channel
        .consume(
          DEAD_LETTER_QUEUE,
          async (message) => {
            if (!message) {
              return;
            }

            const candidate = JSON.parse(message.content.toString()) as {
              eventId: string;
              eventType: string;
            };

            if (candidate.eventId !== event.eventId) {
              channel.ack(message);
              return;
            }

            clearTimeout(timeout);

            const result = {
              messageId: message.properties.messageId,
              lastError: message.properties.headers?.["x-last-error"],
              eventId: candidate.eventId,
              eventType: candidate.eventType,
            };

            channel.ack(message);

            if (consumerTag) {
              await channel.cancel(consumerTag);
            }

            resolve(result);
          },
          { noAck: false },
        )
        .then(({ consumerTag: tag }) => {
          consumerTag = tag;
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });

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

    const result = await deadLetterResult;

    expect(result.messageId).toBe(event.eventId);
    expect(result.lastError).toBe(
      "Inventory event processing failed after retries",
    );
    expect(result.eventId).toBe(event.eventId);
    expect(result.eventType).toBe("PurchaseOrderApproved");
  });
});

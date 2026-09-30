import { env } from "./config/env.js";
import amqp, { type ConfirmChannel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { featureFlags } from "@mms/feature-flags";
import { app } from "./app.js";
import { pool } from "./db/index.js";
import { processFinancialEvent } from "./modules/events/financial-event-service.js";
import { ZodError } from "zod";

const EXCHANGE = "mms.events";
const QUEUE = `${env.RABBITMQ_QUEUE_PREFIX}financials.source-events`;
let connection: ChannelModel | undefined;
let channel: ConfirmChannel | undefined;
let stopped = false;
async function publishAndConfirm(exchange: string, routingKey: string, message: ConsumeMessage, headers: Record<string, unknown>) {
  if (!channel) throw new Error("Financials event channel is unavailable");
  channel.publish(exchange, routingKey, message.content, {
    persistent: true,
    contentType: message.properties.contentType,
    messageId: message.properties.messageId,
    headers,
  });
  await channel.waitForConfirms();
}
async function consume(message: ConsumeMessage) {
  const activeChannel = channel;
  if (!activeChannel) return;
  try {
    await processFinancialEvent(JSON.parse(message.content.toString("utf8")));
    activeChannel.ack(message);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      try {
        await publishAndConfirm("financials.dead", message.fields.routingKey, message, {
          ...message.properties.headers,
          deadLetterReason: error instanceof SyntaxError ? "INVALID_JSON" : "INVALID_EVENT",
        });
        activeChannel.ack(message);
      } catch (publishError) {
        console.error("Financials could not route an invalid event to the dead-letter queue:", publishError);
        activeChannel.nack(message, false, true);
      }
      return;
    }
    const retryCount = Number(message.properties.headers?.financialsRetryCount ?? 0);
    if (Number.isSafeInteger(retryCount) && retryCount < 5) {
      try {
        await publishAndConfirm("financials.retry", message.fields.routingKey, message, {
          ...message.properties.headers,
          financialsRetryCount: retryCount + 1,
        });
        activeChannel.ack(message);
      } catch (publishError) {
        console.error("Financials could not publish a bounded retry:", publishError);
        activeChannel.nack(message, false, true);
      }
      return;
    }
    try {
      await publishAndConfirm("financials.dead", message.fields.routingKey, message, {
        ...message.properties.headers,
        deadLetterReason: "RETRIES_EXHAUSTED",
      });
      activeChannel.ack(message);
    } catch (publishError) {
      console.error("Financials could not route an exhausted event to the dead-letter queue:", publishError);
      activeChannel.nack(message, false, true);
    }
    console.error("Financials exhausted retries for source event:", error);
  }
}
async function connect() {
  if (stopped) return;
  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();
    await channel.prefetch(10);
    await channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await channel.assertExchange("financials.dead", "topic", { durable: true });
    await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
    await channel.bindQueue(`${QUEUE}.dead`, "financials.dead", "#");
    await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": "financials.dead" } });
    await channel.assertExchange("financials.retry", "topic", { durable: true });
    for (const eventType of ["SaleCompleted", "SaleReturned", "InventoryValuationChanged"]) {
      await channel.bindQueue(QUEUE, EXCHANGE, eventType);
      const retryQueue = `${QUEUE}.retry.${eventType}`;
      await channel.assertQueue(retryQueue, { durable: true, arguments: { "x-message-ttl": 5000, "x-dead-letter-exchange": EXCHANGE, "x-dead-letter-routing-key": eventType } });
      await channel.bindQueue(retryQueue, "financials.retry", eventType);
    }
    if (featureFlags.financials) await channel.consume(QUEUE, (message) => { if (message) void consume(message); });
    connection.on("close", () => { channel = undefined; connection = undefined; if (!stopped) setTimeout(() => void connect(), 3000); });
    connection.on("error", (error) => console.error("Financials RabbitMQ connection error:", error));
    console.info("Financials event consumer connected");
  } catch (error) {
    console.error("Financials could not connect to RabbitMQ:", error);
    setTimeout(() => void connect(), 5000);
  }
}
const server = app.listen(env.PORT, () => console.info(`Financials listening on ${env.PORT}`));
void connect();
async function shutdown() {
  stopped = true;
  server.close();
  try { await channel?.close(); } catch {}
  try { await connection?.close(); } catch {}
  await pool.end();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

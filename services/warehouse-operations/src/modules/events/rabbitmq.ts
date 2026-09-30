import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { env } from "../../config/env.js";

const EVENTS_EXCHANGE = "mms.events";
let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

export async function getRabbitMQChannel() {
  if (channel) return channel;

  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createConfirmChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  connection.on("close", () => {
    connection = null;
    channel = null;
  });
  connection.on("error", () => {
    connection = null;
    channel = null;
  });
  return channel;
}

export async function closeRabbitMQ() {
  const activeChannel = channel;
  const activeConnection = connection;
  channel = null;
  connection = null;
  await activeChannel?.close().catch(() => undefined);
  await activeConnection?.close().catch(() => undefined);
}

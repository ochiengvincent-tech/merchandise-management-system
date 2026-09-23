import amqp from "amqplib";
import { env } from "../../config/env.js";

const EXCHANGE_NAME = "mms.events";

let connection: Awaited<
  ReturnType<typeof amqp.connect>
> | null = null;

let channel: Awaited<
  ReturnType<
    Awaited<ReturnType<typeof amqp.connect>>["createConfirmChannel"]
  >
> | null = null;

export const getRabbitMqChannel = async () => {
  if (channel) {
    return channel;
  }

  connection = await amqp.connect(env.RABBITMQ_URL);

  channel = await connection.createConfirmChannel();

  await channel.assertExchange(EXCHANGE_NAME, "topic", {
    durable: true
  });

  connection.on("close", () => {
    connection = null;
    channel = null;
  });

  connection.on("error", () => {
    connection = null;
    channel = null;
  });

  return channel;
};

export const closeRabbitMq = async () => {
  if (channel) {
    await channel.close();
    channel = null;
  }

  if (connection) {
    await connection.close();
    connection = null;
  }
};

export { EXCHANGE_NAME };

import type { Channel } from "amqplib";

export const EVENTS_EXCHANGE = "mms.events";

export async function setupRabbitMQTopology(
  channel: Channel,
) {
  await channel.assertExchange(
    EVENTS_EXCHANGE,
    "topic",
    {
      durable: true,
    },
  );
}
import { db } from "../../db/index.js";
import {
  findPendingOutboxEvents,
  incrementOutboxEventAttempts,
  markOutboxEventFailed,
  markOutboxEventPublished
} from "./outbox-repository.js";
import {
  EXCHANGE_NAME,
  getRabbitMqChannel
} from "./rabbitmq.js";

const MAX_ATTEMPTS = 3;
const PUBLISH_TIMEOUT_MS = 5000;

const waitForConfirm = async (
  channel: Awaited<ReturnType<typeof getRabbitMqChannel>>
) => {
  await Promise.race([
    channel.waitForConfirms(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("RabbitMQ publish confirmation timed out"));
      }, PUBLISH_TIMEOUT_MS);
    })
  ]);
};

export const publishPendingOutboxEvents = async () => {
  const events = await findPendingOutboxEvents();

  if (events.length === 0) {
    return;
  }

  const channel = await getRabbitMqChannel();

  for (const event of events) {
    if (event.attempts >= MAX_ATTEMPTS) {
      await markOutboxEventFailed(event.id, db);
      continue;
    }

    try {
      channel.publish(
        EXCHANGE_NAME,
        event.eventType,
        Buffer.from(JSON.stringify(event.payload)),
        {
          persistent: true,
          contentType: "application/json",
          messageId: event.eventId
        }
      );

      await waitForConfirm(channel);

      await markOutboxEventPublished(event.id, db);
    } catch (error) {
      const updatedEvent = await incrementOutboxEventAttempts(
        event.id,
        db
      );

      if (
        updatedEvent &&
        updatedEvent.attempts >= MAX_ATTEMPTS
      ) {
        await markOutboxEventFailed(event.id, db);
      }

      console.error(
        `Failed to publish outbox event ${event.eventId}:`,
        error
      );

      break;
    }
  }
};
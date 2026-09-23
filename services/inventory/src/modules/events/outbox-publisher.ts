import { db, pool } from "../../db/index.js";
import {
  findPendingOutboxEvents,
  incrementOutboxEventAttempts,
  markOutboxEventFailed,
  markOutboxEventPublished,
} from "./outbox-repository.js";
import { EXCHANGE_NAME, getRabbitMqChannel } from "./rabbitmq.js";
import type { EventEnvelope } from "./event-envelope.js";

const MAX_ATTEMPTS = 3;
const PUBLISH_TIMEOUT_MS = 5000;
const OUTBOX_LOCK_KEY = "mms.inventory.outbox.publisher";

const waitForConfirm = async (
  channel: Awaited<ReturnType<typeof getRabbitMqChannel>>,
) => {
  await Promise.race([
    channel.waitForConfirms(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("RabbitMQ publish confirmation timed out"));
      }, PUBLISH_TIMEOUT_MS);
    }),
  ]);
};

export const publishPendingOutboxEvents = async () => {
  const client = await pool.connect();

  try {
    const lockResult = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [OUTBOX_LOCK_KEY],
    );

    if (!lockResult.rows[0]?.locked) {
      return;
    }

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
          Buffer.from(
            JSON.stringify({
              eventId: event.eventId,
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
              occurredAt: event.occurredAt,
            } satisfies EventEnvelope),
          ),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.eventId,
          },
        );

        await waitForConfirm(channel);

        await markOutboxEventPublished(event.id, db);
      } catch (error) {
        const updatedEvent = await incrementOutboxEventAttempts(event.id, db);

        if (updatedEvent && updatedEvent.attempts >= MAX_ATTEMPTS) {
          await markOutboxEventFailed(event.id, db);
        }

        console.error(
          `Failed to publish outbox event ${event.eventId}:`,
          error,
        );

        break;
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [OUTBOX_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
};

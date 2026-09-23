import {
  findPendingOutboxEvents,
  incrementOutboxEventAttempt,
  markOutboxEventFailed,
  markOutboxEventPublished,
} from "./outbox-repository.js";
import { pool } from "../../db/index.js";

import { getRabbitMQChannel } from "./rabbitmq.js";
import { EVENTS_EXCHANGE } from "./rabbitmq-topology.js";

const MAX_ATTEMPTS = 3;
const PUBLISH_TIMEOUT_MS = 5_000;
const OUTBOX_LOCK_KEY = "mms.procurement.outbox.publisher";

const waitForConfirm = async (
  channel: Awaited<ReturnType<typeof getRabbitMQChannel>>,
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

export async function publishPendingOutboxEvents() {
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

    for (const event of events) {
      if (event.attempts >= MAX_ATTEMPTS) {
        await markOutboxEventFailed(event.id);
        continue;
      }

      try {
        const channel = await getRabbitMQChannel();

        channel.publish(
          EVENTS_EXCHANGE,
          event.eventType,
          Buffer.from(
            JSON.stringify({
              eventId: event.eventId,
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
              occurredAt: event.occurredAt,
            }),
          ),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.eventId,
          },
        );

        await waitForConfirm(channel);

        await markOutboxEventPublished(event.id);
      } catch (error) {
        const updatedEvent = await incrementOutboxEventAttempt(event.id);

        if (updatedEvent && updatedEvent.attempts >= MAX_ATTEMPTS) {
          await markOutboxEventFailed(event.id);
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
}

import {
  findPublishableOutboxEvents,
  incrementOutboxEventAttempt,
  markOutboxEventPublished,
} from "./outbox-repository.js";
import { EVENTS_EXCHANGE, getRabbitMqChannel } from "./rabbitmq.js";

const PUBLISH_TIMEOUT_MS = 5_000;

export async function publishPendingGoodsReceivedEvents() {
  const events = await findPublishableOutboxEvents();

  for (const event of events) {
    try {
      const channel = await getRabbitMqChannel();
      channel.publish(
        EVENTS_EXCHANGE,
        event.eventType,
        Buffer.from(
          JSON.stringify({
            eventId: event.eventId,
            eventType: event.eventType,
            aggregateType: "GoodsReceipt",
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

      await Promise.race([
        channel.waitForConfirms(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("RabbitMQ publish confirmation timed out")),
            PUBLISH_TIMEOUT_MS,
          );
        }),
      ]);

      await markOutboxEventPublished(event.id);
    } catch (error) {
      const updated = await incrementOutboxEventAttempt(event.id);
      console.error(
        `Could not publish GoodsReceived event ${event.eventId}; attempts ${updated?.attempts ?? "unknown"}:`,
        error,
      );
      // Keep processing this batch; a single bad or delayed event must not
      // prevent unrelated goods receipts from reaching Inventory.
      continue;
    }
  }
}

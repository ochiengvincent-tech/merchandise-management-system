import { featureFlags } from "@mms/feature-flags";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeRabbitMq } from "./modules/events/rabbitmq.js";
import { publishPendingOutboxEvents } from "./modules/events/outbox-publisher.js";
import { startRabbitMqConsumer } from "./modules/events/rabbitmq-consumer.js";

const OUTBOX_POLL_INTERVAL_MS = 1000;
const RABBITMQ_RECONNECT_DELAY_MS = 5_000;

let stopping = false;

const publishOutbox = async () => {
  try {
    await publishPendingOutboxEvents();
  } catch (error) {
    console.error("Outbox publisher error:", error);
  }
};

const startConsumerWithRetry = async (): Promise<void> => {
  try {
    await startRabbitMqConsumer();
  } catch (error) {
    console.error("Inventory RabbitMQ unavailable; retrying:", error);

    if (!stopping) {
      setTimeout(startConsumerWithRetry, RABBITMQ_RECONNECT_DELAY_MS);
    }
  }
};

const interval = setInterval(publishOutbox, OUTBOX_POLL_INTERVAL_MS);

app.listen(env.PORT, () => {
  console.log(`Inventory service running on port ${env.PORT}`);
});

if (featureFlags.inventory) {
  void startConsumerWithRetry();
}

const shutdown = async () => {
  stopping = true;
  clearInterval(interval);
  await closeRabbitMq();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

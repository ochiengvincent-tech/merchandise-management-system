import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeRabbitMq } from "./modules/events/rabbitmq.js";
import { publishPendingOutboxEvents } from "./modules/events/outbox-publisher.js";

const OUTBOX_POLL_INTERVAL_MS = 1000;

const publishOutbox = async () => {
  try {
    await publishPendingOutboxEvents();
  } catch (error) {
    console.error("Outbox publisher error:", error);
  }
};

const interval = setInterval(publishOutbox, OUTBOX_POLL_INTERVAL_MS);

app.listen(env.PORT, () => {
  console.log(`Inventory service running on port ${env.PORT}`);
});

const shutdown = async () => {
  clearInterval(interval);
  await closeRabbitMq();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
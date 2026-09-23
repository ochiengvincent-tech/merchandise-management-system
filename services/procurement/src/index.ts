import { featureFlags } from "@mms/feature-flags";
import app from "./app.js";
import { env } from "./config/env.js";

import {
  getRabbitMQChannel,
  closeRabbitMQ,
} from "./modules/events/rabbitmq.js";
import { setupRabbitMQTopology } from "./modules/events/rabbitmq-topology.js";
import { publishPendingOutboxEvents } from "./modules/events/outbox-publisher.js";

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

const connectRabbitMqTopology = async (): Promise<void> => {
  try {
    const channel = await getRabbitMQChannel();
    await setupRabbitMQTopology(channel);
    console.log("Procurement RabbitMQ publisher connected");
  } catch (error) {
    console.error("Procurement RabbitMQ unavailable; retrying:", error);

    if (!stopping) {
      setTimeout(connectRabbitMqTopology, RABBITMQ_RECONNECT_DELAY_MS);
    }
  }
};

const interval = featureFlags.procurement
  ? setInterval(publishOutbox, OUTBOX_POLL_INTERVAL_MS)
  : undefined;

app.listen(env.PORT, () => {
  console.log(`Procurement service running on port ${env.PORT}`);
});

if (featureFlags.procurement) {
  void connectRabbitMqTopology();
}

const shutdown = async () => {
  stopping = true;

  if (interval) {
    clearInterval(interval);
  }

  await closeRabbitMQ();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

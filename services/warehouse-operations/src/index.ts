import app from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { closeRabbitMQ } from "./modules/events/rabbitmq.js";
import {
  startWarehouseConsumer,
  stopWarehouseConsumer,
} from "./modules/events/warehouse-consumer.js";
import { featureFlags } from "@mms/feature-flags";
import { publishPendingWarehouseEvents } from "./modules/events/outbox-publisher.js";

const OUTBOX_POLL_INTERVAL_MS = 3_000;
const pollOutbox = async () => {
  try { await publishPendingWarehouseEvents(); }
  catch (error) { console.error("Warehouse outbox publisher error:", error); }
};
if (featureFlags.warehouseOperations) void pollOutbox();
const outboxInterval = featureFlags.warehouseOperations
  ? setInterval(() => void pollOutbox(), OUTBOX_POLL_INTERVAL_MS)
  : null;

const server = app.listen(env.PORT, () => {
  console.log(`Warehouse Operations running on port ${env.PORT}`);
});

if (featureFlags.warehouseOperations) void startWarehouseConsumer();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (outboxInterval) clearInterval(outboxInterval);
  try {
    await stopWarehouseConsumer();
    await closeRabbitMQ();
  } catch (error) {
    console.error("Warehouse Operations RabbitMQ shutdown failed:", error);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

import app from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { closeRabbitMQ } from "./modules/events/rabbitmq.js";
import {
  startVendorReliabilityConsumer,
  stopVendorReliabilityConsumer,
} from "./modules/reliability/vendor-reliability-consumer.js";
import { refreshAllVendorReliabilitySummaries } from "./modules/reliability/vendor-reliability.repository.js";

const server = app.listen(env.PORT, () => {
  console.log(`Vendor Management running on port ${env.PORT}`);
});

void startVendorReliabilityConsumer();
void refreshAllVendorReliabilitySummaries().catch((error) => {
  console.error("Could not refresh supplier reliability summaries:", error);
});

const summaryRefreshInterval = setInterval(() => {
  void refreshAllVendorReliabilitySummaries().catch((error) => {
    console.error("Could not refresh supplier reliability summaries:", error);
  });
}, 60_000);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(summaryRefreshInterval);
  try {
    await stopVendorReliabilityConsumer();
    await closeRabbitMQ();
  } catch (error) {
    console.error("Vendor Management RabbitMQ shutdown failed:", error);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

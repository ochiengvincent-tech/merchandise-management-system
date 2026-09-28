import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { featureFlags } from "@mms/feature-flags";
import { closeRabbitMq } from "./modules/events/rabbitmq.js";
import { publishPendingGoodsReceivedEvents } from "./modules/events/outbox-publisher.js";
import { retryPendingProcurementSyncs } from "./modules/receipts/receipt-service.js";

const server = app.listen(env.PORT, () => {
  console.log(`Receiving service running on port ${env.PORT}`);
});

const OUTBOX_POLL_INTERVAL_MS = 5_000;
const pollOutbox = async () => {
  if (!featureFlags.receiving) return;
  try {
    await retryPendingProcurementSyncs();
    await publishPendingGoodsReceivedEvents();
  } catch (error) {
    console.error("Receiving outbox publisher error:", error);
  }
};
const outboxInterval = setInterval(() => void pollOutbox(), OUTBOX_POLL_INTERVAL_MS);

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(outboxInterval);

  server.close(async (error) => {
    if (error) console.error("Receiving HTTP server shutdown failed:", error);
    await closeRabbitMq();
    await pool.end();
    process.exit(error ? 1 : 0);
  });
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

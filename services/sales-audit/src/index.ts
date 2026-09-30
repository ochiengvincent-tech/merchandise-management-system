import "./config/env.js";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { featureFlags } from "@mms/feature-flags";
import { closeRabbitMQ } from "./modules/events/rabbitmq.js";
import { startSalesAuditConsumer, stopSalesAuditConsumer } from "./modules/events/sales-audit-consumer.js";

const server = app.listen(env.PORT, () => console.log(`Sales Audit running on port ${env.PORT}`));
if (featureFlags.salesAudit) void startSalesAuditConsumer();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stopSalesAuditConsumer();
  await closeRabbitMQ();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

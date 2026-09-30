import "./config/env.js";
import { featureFlags } from "@mms/feature-flags";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { closeRabbitMQ } from "./modules/events/rabbitmq.js";
import { publishPendingRetailEvents } from "./modules/events/outbox-publisher.js";
const POLL_MS = 3000;
let stopping = false;
const publish = async () => { try { await publishPendingRetailEvents(); } catch (error) { console.error("Retail Sales outbox publisher error:", error); } };
if (featureFlags.retailSales) void publish();
const interval = featureFlags.retailSales ? setInterval(() => void publish(), POLL_MS) : null;
const server = app.listen(env.PORT, () => console.log(`Retail Sales running on port ${env.PORT}`));
async function shutdown() {
  if (stopping) return; stopping = true;
  if (interval) clearInterval(interval);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeRabbitMQ(); await pool.end();
}
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());

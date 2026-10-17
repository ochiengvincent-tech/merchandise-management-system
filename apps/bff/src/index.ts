import { app, closeSessionStore, connectSessionStore } from "./app.js";
import { env } from "./config.js";

await connectSessionStore();
const server = app.listen(env.PORT, () => console.info(`MMS BFF listening on ${env.PORT}`));

async function shutdown() {
  server.close(async () => {
    await closeSessionStore();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

import express, { type Application } from "express";
import { pool } from "./db/index.js";
import approvalRoutes from "./modules/approvals/approval-routes.js";
import amendmentRoutes from "./modules/amendments/amendment-routes.js";
import purchaseOrderRoutes from "./modules/purchase-orders/purchase-order-routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { getRabbitMQChannel } from "./modules/events/rabbitmq.js";
import { EVENTS_EXCHANGE } from "./modules/events/rabbitmq-topology.js";

const app: Application = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "procurement",
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const channel = await getRabbitMQChannel();
    await channel.checkExchange(EVENTS_EXCHANGE);

    return res.status(200).json({
      status: "ready",
      service: "procurement",
      dependencies: {
        database: "ok",
        rabbitmq: "ok",
      },
    });
  } catch {
    return res.status(503).json({
      status: "not_ready",
      service: "procurement",
    });
  }
});

app.use("/api/v1/purchase-orders", purchaseOrderRoutes);
app.use("/api/v1/purchase-orders", approvalRoutes);
app.use("/api/v1/amendments", amendmentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

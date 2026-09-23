import express, { type Application } from "express";
import { pool } from "./db/index.js";

import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { getRabbitMqChannel } from "./modules/events/rabbitmq.js";

import { productRouter } from "./modules/products/product-routes.js";
import { locationRouter } from "./modules/locations/location-routes.js";
import { stockRouter } from "./modules/stock/stock-routes.js";
import { adjustmentRouter } from "./modules/adjustments/adjustment-routes.js";
import { eventRouter } from "./modules/events/event-routes.js";

const app: Application = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "inventory",
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const channel = await getRabbitMqChannel();
    await channel.checkExchange("mms.events");

    return res.status(200).json({
      status: "ready",
      service: "inventory",
      dependencies: {
        database: "ok",
        rabbitmq: "ok",
      },
    });
  } catch {
    return res.status(503).json({
      status: "not_ready",
      service: "inventory",
    });
  }
});

app.use("/api/v1/products", productRouter);
app.use("/api/v1/locations", locationRouter);
app.use("/api/v1/stock", stockRouter);
app.use("/api/v1/adjustments", adjustmentRouter);
app.use("/api/v1/events", eventRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

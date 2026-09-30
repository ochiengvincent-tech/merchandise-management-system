import "./config/env.js";
import express, { type Application } from "express";
import { featureFlags } from "@mms/feature-flags";
import { pool } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { binRouter } from "./modules/bins/bin-routes.js";
import { putawayRouter } from "./modules/putaway/putaway-routes.js";
import { adjustmentRouter } from "./modules/movements/adjustment-routes.js";
import { bootstrapRouter } from "./modules/bootstrap/bootstrap-routes.js";
import { queryRouter } from "./modules/queries/query-routes.js";
import { transferRouter } from "./modules/movements/transfer-routes.js";

const app: Application = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  return res.status(200).json({ status: "ok", service: "warehouse-operations" });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      status: "ready",
      service: "warehouse-operations",
      dependencies: { database: "ok" },
    });
  } catch {
    return res.status(503).json({ status: "not_ready", service: "warehouse-operations" });
  }
});

if (featureFlags.warehouseOperations) {
  app.use("/api/v1", binRouter);
  app.use("/api/v1", putawayRouter);
  app.use("/api/v1", adjustmentRouter);
  app.use("/api/v1", bootstrapRouter);
  app.use("/api/v1", queryRouter);
  app.use("/api/v1", transferRouter);
} else {
  app.use("/api/v1", (_req, res) => {
    return res.status(404).json({ error: { message: "Warehouse Operations is currently unavailable" } });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

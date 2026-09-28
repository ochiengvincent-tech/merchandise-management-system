import "dotenv/config";
import express, { type Application } from "express";
import { featureFlags } from "@mms/feature-flags";
import { pool } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { auditRouter } from "./modules/audit/audit-routes.js";
import { receivingPurchaseOrderRouter } from "./modules/receipts/purchase-order-routes.js";
import { receiptRouter } from "./modules/receipts/receipt-routes.js";

const app: Application = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  return res.status(200).json({ status: "ok", service: "receiving" });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      status: "ready",
      service: "receiving",
      dependencies: { database: "ok" },
    });
  } catch {
    return res.status(503).json({
      status: "not_ready",
      service: "receiving",
    });
  }
});

if (featureFlags.receiving) {
  app.use("/api/v1/audit-logs", auditRouter);
  app.use("/api/v1/purchase-orders", receivingPurchaseOrderRouter);
  app.use("/api/v1/receipts", receiptRouter);
} else {
  app.use("/api/v1", (_req, res) => {
    return res.status(404).json({
      error: { message: "Receiving is currently unavailable" },
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

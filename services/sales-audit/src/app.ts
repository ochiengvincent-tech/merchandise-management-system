import "./config/env.js";
import express, { type Application } from "express";
import { featureFlags } from "@mms/feature-flags";
import { pool } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { sessionRouter } from "./modules/sessions/session-routes.js";
import { auditRouter } from "./modules/sessions/audit-routes.js";

const app: Application = express();
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "sales-audit" }));
app.get("/ready", async (_req, res) => {
  try { await pool.query("SELECT 1"); return res.json({ status: "ready", service: "sales-audit", dependencies: { database: "ok" } }); }
  catch { return res.status(503).json({ status: "not_ready", service: "sales-audit" }); }
});
if (featureFlags.salesAudit) app.use("/api/v1", sessionRouter, auditRouter);
else app.use("/api/v1", (_req, res) => res.status(404).json({ error: { message: "Sales Audit is currently unavailable" } }));
app.use(notFoundHandler);
app.use(errorHandler);
export { app };

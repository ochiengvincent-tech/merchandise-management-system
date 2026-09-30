import express from "express";
import { featureFlags } from "@mms/feature-flags";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { ledgerRouter } from "./modules/ledger/ledger-routes.js";
import { invoiceRouter } from "./modules/invoices/invoice-routes.js";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "financials" }));
app.get("/ready", async (_req, res) => {
  try { await (await import("./db/index.js")).pool.query("SELECT 1"); return res.json({ status: "ready", service: "financials" }); }
  catch { return res.status(503).json({ status: "not_ready", service: "financials" }); }
});
app.use("/api/v1", (_req, res, next) => featureFlags.financials ? next() : res.status(404).json({ error: { message: "Financials is not enabled." } }));
app.use("/api/v1", ledgerRouter, invoiceRouter);
app.use(notFoundHandler);
app.use(errorHandler);

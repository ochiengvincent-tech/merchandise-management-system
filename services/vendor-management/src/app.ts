import express, { type Application } from "express";
import { pool } from "./db/index.js";
import vendorRoutes from "./modules/vendors/vendor.routes.js";
import vendorProductRoutes from "./modules/vendor-products/vendor-product.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { featureFlags } from "@mms/feature-flags";

const app: Application = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "vendor-management",
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "ready",
      service: "vendor-management",
      dependencies: {
        database: "ok",
      },
    });
  } catch {
    return res.status(503).json({
      status: "not_ready",
      service: "vendor-management",
    });
  }
});
if(featureFlags.vendorManagement){
app.use("/api/v1/vendors", vendorRoutes);
app.use("/api/v1/vendors", vendorProductRoutes);
}


app.use(notFoundHandler);
app.use(errorHandler);

export default app;

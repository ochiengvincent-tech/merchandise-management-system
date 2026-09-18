import express, { type Application } from "express";
import vendorRoutes from "./modules/vendors/vendor.routes.js";
import vendorProductRoutes from "./modules/vendor-products/vendor-product.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app: Application = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "vendor-management",
  });
});

app.use("/vendors", vendorRoutes);
app.use("/vendors", vendorProductRoutes);

app.use(errorHandler);

export default app;
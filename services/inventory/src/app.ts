import express, { type Application } from "express";
import { errorHandler } from "./middleware/error-handler.js";
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

app.use("/products", productRouter);
app.use("/locations", locationRouter);
app.use("/stock", stockRouter);
app.use("/adjustments", adjustmentRouter);
app.use("/events", eventRouter);

app.use(errorHandler);

export { app };

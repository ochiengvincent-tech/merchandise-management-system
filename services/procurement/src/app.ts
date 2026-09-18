import express, { type Application } from "express";
import purchaseOrderRoutes from "./modules/purchase-orders/purchase-order-routes.js";

const app:Application = express();

app.use(express.json());

app.use("/purchase-orders", purchaseOrderRoutes);

export default app;
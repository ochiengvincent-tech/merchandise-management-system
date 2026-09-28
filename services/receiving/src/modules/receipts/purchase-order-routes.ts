import { Router, type Router as ExpressRouter } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  getReceivingPurchaseOrderController,
  listOpenPurchaseOrdersController,
} from "./purchase-order-controller.js";

export const receivingPurchaseOrderRouter: ExpressRouter = Router();

receivingPurchaseOrderRouter.get("/open", listOpenPurchaseOrdersController);
receivingPurchaseOrderRouter.all("/open", methodNotAllowed);
receivingPurchaseOrderRouter.get("/:id", getReceivingPurchaseOrderController);
receivingPurchaseOrderRouter.all("/:id", methodNotAllowed);

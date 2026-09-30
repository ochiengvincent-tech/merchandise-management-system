import { Router, type Router as ExpressRouter } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  createReceiptController,
  getReceiptController,
  listReceiptsController,
} from "./receipt-controller.js";

export const receiptRouter: ExpressRouter = Router();

receiptRouter.post("/", createReceiptController);
receiptRouter.get("/", listReceiptsController);
receiptRouter.all("/", methodNotAllowed);
receiptRouter.get("/:id", getReceiptController);
receiptRouter.all("/:id", methodNotAllowed);

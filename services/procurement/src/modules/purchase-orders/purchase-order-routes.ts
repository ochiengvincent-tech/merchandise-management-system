import { Router } from "express";
import { createPurchaseOrderController } from "./purchase-order-controller.js";

const router:Router = Router();

router.post("/", createPurchaseOrderController);

export default router;
import { Router } from "express";
import {
  purchaseOrderApprovedEventController,
  purchaseOrderCancelledEventController
} from "./event-controller.js";

const router: Router = Router();

router.post(
  "/purchase-order-approved",
  purchaseOrderApprovedEventController
);

router.post(
  "/purchase-order-cancelled",
  purchaseOrderCancelledEventController
);

export { router as eventRouter };
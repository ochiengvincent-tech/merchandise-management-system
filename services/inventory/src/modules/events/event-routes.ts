import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  purchaseOrderApprovedEventController,
  purchaseOrderCancelledEventController,
} from "./event-controller.js";

const router: Router = Router();

router.post("/purchase-order-approved", purchaseOrderApprovedEventController);
router.all("/purchase-order-approved", methodNotAllowed);

router.post("/purchase-order-cancelled", purchaseOrderCancelledEventController);
router.all("/purchase-order-cancelled", methodNotAllowed);

export { router as eventRouter };

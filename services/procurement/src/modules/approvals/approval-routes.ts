import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  approvePurchaseOrderController,
  rejectPurchaseOrderController,
} from "./approval-controller.js";

const router: Router = Router();

router.patch("/:id/approve", approvePurchaseOrderController);
router.all("/:id/approve", methodNotAllowed);

router.patch("/:id/reject", rejectPurchaseOrderController);
router.all("/:id/reject", methodNotAllowed);

export default router;

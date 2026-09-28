import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  listPurchaseOrderAmendmentsController,
  approvePurchaseOrderAmendmentController,
  rejectPurchaseOrderAmendmentController,
  requestPurchaseOrderAmendmentController,
} from "./amendment-controller.js";

const router: Router = Router();

router.get("/purchase-orders/:id", listPurchaseOrderAmendmentsController);
router.post("/purchase-orders/:id", requestPurchaseOrderAmendmentController);
router.all("/purchase-orders/:id", methodNotAllowed);

router.patch("/:id/approve", approvePurchaseOrderAmendmentController);
router.all("/:id/approve", methodNotAllowed);
router.patch("/:id/reject", rejectPurchaseOrderAmendmentController);
router.all("/:id/reject", methodNotAllowed);

export default router;

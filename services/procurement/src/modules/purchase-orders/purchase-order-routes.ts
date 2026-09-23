import { Router } from "express";

import { methodNotAllowed } from "../../middleware/method-not-allowed.js";

import { createPurchaseOrderController } from "./purchase-order-controller.js";

import { getPurchaseOrderController } from "./purchase-order-get-controller.js";

import { sendPurchaseOrderController } from "./purchase-order-send-controller.js";

import { submitPurchaseOrderForApprovalController } from "./purchase-order-submission-controller.js";

import { updatePurchaseOrderController } from "./purchase-order-update-controller.js";

import { cancelPurchaseOrderController } from "./purchase-order-cancellation-controller.js";
import { receivePurchaseOrderController } from "./purchase-order-receipt-controller.js";

const router: Router = Router();

router.post("/", createPurchaseOrderController);

router.all("/", methodNotAllowed);

router.patch("/:id/submit", submitPurchaseOrderForApprovalController);

router.all("/:id/submit", methodNotAllowed);

router.patch("/:id/send", sendPurchaseOrderController);

router.all("/:id/send", methodNotAllowed);

router.patch("/:id/cancel", cancelPurchaseOrderController);

router.all("/:id/cancel", methodNotAllowed);

router.post("/:id/receipts", receivePurchaseOrderController);

router.all("/:id/receipts", methodNotAllowed);

router.get("/:id", getPurchaseOrderController);

router.patch("/:id", updatePurchaseOrderController);
export default router;

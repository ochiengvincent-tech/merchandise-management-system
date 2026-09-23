import { Router } from "express";

import { methodNotAllowed } from "../../middleware/method-not-allowed.js";

import { createPurchaseOrderController } from "./purchase-order-controller.js";

import { getPurchaseOrderController } from "./purchase-order-get-controller.js";

import { sendPurchaseOrderController } from "../sending/purchase-order-send-controller.js";

import { submitPurchaseOrderForApprovalController } from "../submissions/purchase-order-submission-controller.js";

import { updatePurchaseOrderController } from "../updates/purchase-order-update-controller.js";

import { cancelPurchaseOrderController } from "../cancellations/purchase-order-cancellation-controller.js";
import { receivePurchaseOrderController } from "../receipts/purchase-order-receipt-controller.js";

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

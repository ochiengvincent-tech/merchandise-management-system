import { Router } from "express";
import { featureFlags } from "@mms/feature-flags";

import { methodNotAllowed } from "../../middleware/method-not-allowed.js";

import { createPurchaseOrderController } from "./purchase-order-controller.js";
import { getPurchaseOrderController } from "./purchase-order-get-controller.js";
import { listPurchaseOrdersController } from "./purchase-order-list-controller.js";
import { getPurchaseOrderPolicyController } from "./purchase-order-policy-controller.js";

import { sendPurchaseOrderController } from "../sending/purchase-order-send-controller.js";

import { submitPurchaseOrderForApprovalController } from "../submissions/purchase-order-submission-controller.js";

import { updatePurchaseOrderController } from "../updates/purchase-order-update-controller.js";

import { cancelPurchaseOrderController } from "../cancellations/purchase-order-cancellation-controller.js";
import { receivePurchaseOrderController } from "../receipts/purchase-order-receipt-controller.js";

const router: Router = Router();

router.post("/", createPurchaseOrderController);
router.get("/", listPurchaseOrdersController);
router.get("/policy", getPurchaseOrderPolicyController);

router.all("/", methodNotAllowed);

router.patch("/:id/submit", submitPurchaseOrderForApprovalController);

router.all("/:id/submit", methodNotAllowed);

router.patch("/:id/send", sendPurchaseOrderController);

router.all("/:id/send", methodNotAllowed);

router.patch("/:id/cancel", cancelPurchaseOrderController);

router.all("/:id/cancel", methodNotAllowed);

if (featureFlags.receiving) {
  router.post("/:id/receipts/from-receiving", (req, res, next) => {
    if (typeof req.body?.receivingReceiptId !== "string") {
      return res.status(400).json({
        error: { message: "A Receiving receipt ID is required" },
      });
    }
    return receivePurchaseOrderController(req, res, next);
  });
  router.all("/:id/receipts/from-receiving", methodNotAllowed);

  router.post("/:id/receipts", (_req, res) =>
    res.status(409).json({
      error: {
        message:
          "Direct purchase-order receipt is disabled while Receiving is enabled. Record deliveries through the Receiving service.",
      },
    }),
  );
} else {
  router.post("/:id/receipts", receivePurchaseOrderController);
}

router.all("/:id/receipts", methodNotAllowed);

router.get("/:id", getPurchaseOrderController);

router.patch("/:id", updatePurchaseOrderController);

export default router;

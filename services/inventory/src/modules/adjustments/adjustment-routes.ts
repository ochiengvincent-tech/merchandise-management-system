import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import { createAdjustmentController } from "./adjustment-controller.js";

const router: Router = Router();

router.post("/", createAdjustmentController);
router.all("/", methodNotAllowed);

export { router as adjustmentRouter };

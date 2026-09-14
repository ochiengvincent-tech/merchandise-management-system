import { Router } from "express";
import { createAdjustmentController } from "./adjustment-controller.js";

const router: Router = Router();

router.post("/", createAdjustmentController);

export { router as adjustmentRouter };
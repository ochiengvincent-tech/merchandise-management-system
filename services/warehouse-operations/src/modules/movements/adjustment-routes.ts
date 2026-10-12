import { Router } from "express";
import { postLocationsLocationIdAdjustmentsController, getAdjustmentsIdController } from "./adjustment-controller.js";

const router: Router = Router();

router.post("/locations/:locationId/adjustments", postLocationsLocationIdAdjustmentsController);
router.get("/adjustments/:id", getAdjustmentsIdController);

export { router as adjustmentRouter };

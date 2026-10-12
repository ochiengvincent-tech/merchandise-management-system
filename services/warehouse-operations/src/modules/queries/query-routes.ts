import { Router } from "express";
import { getStockController, getMovementsController, getReconciliationController } from "./query-controller.js";

const router: Router = Router();

router.get("/stock", getStockController);
router.get("/movements", getMovementsController);
router.get("/reconciliation", getReconciliationController);

export { router as queryRouter };

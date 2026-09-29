import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  createStockController,
  createWarehouseAdjustmentController,
  getStockByLocationController,
  getStockByProductAndLocationController,
  getStockByProductController,
  getInventoryValuationController,
} from "./stock-controller.js";
import {
  allocateStockController,
  releaseStockController,
} from "./stock-operation-controller.js";
import { releaseSaleStockController, reserveSaleStockController } from "./sale-reservation-controller.js";

const router: Router = Router();

router.post("/", createStockController);
router.all("/", methodNotAllowed);

router.get("/valuation", getInventoryValuationController);
router.all("/valuation", methodNotAllowed);

router.get("/by-product-and-location", getStockByProductAndLocationController);
router.all("/by-product-and-location", methodNotAllowed);

router.get("/by-product", getStockByProductController);
router.all("/by-product", methodNotAllowed);

router.get("/by-location", getStockByLocationController);
router.all("/by-location", methodNotAllowed);

router.post("/adjustments/from-warehouse", createWarehouseAdjustmentController);
router.all("/adjustments/from-warehouse", methodNotAllowed);

router.post("/allocate", allocateStockController);
router.all("/allocate", methodNotAllowed);

router.post("/release", releaseStockController);
router.all("/release", methodNotAllowed);

router.post("/sale-reservations", reserveSaleStockController);
router.all("/sale-reservations", methodNotAllowed);
router.post("/sale-reservations/:id/release", releaseSaleStockController);
router.all("/sale-reservations/:id/release", methodNotAllowed);

export { router as stockRouter };

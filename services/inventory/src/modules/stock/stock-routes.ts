import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  createStockController,
  getStockByLocationController,
  getStockByProductAndLocationController,
  getStockByProductController,
} from "./stock-controller.js";
import {
  allocateStockController,
  releaseStockController,
} from "./stock-operation-controller.js";

const router: Router = Router();

router.post("/", createStockController);
router.all("/", methodNotAllowed);

router.get("/by-product-and-location", getStockByProductAndLocationController);
router.all("/by-product-and-location", methodNotAllowed);

router.get("/by-product", getStockByProductController);
router.all("/by-product", methodNotAllowed);

router.get("/by-location", getStockByLocationController);
router.all("/by-location", methodNotAllowed);

router.post("/allocate", allocateStockController);
router.all("/allocate", methodNotAllowed);

router.post("/release", releaseStockController);
router.all("/release", methodNotAllowed);

export { router as stockRouter };

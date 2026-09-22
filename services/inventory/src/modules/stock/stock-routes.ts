import { Router } from "express";
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
router.get("/by-product-and-location", getStockByProductAndLocationController);
router.get("/by-product", getStockByProductController);
router.get("/by-location", getStockByLocationController);
router.post("/allocate", allocateStockController);
router.post("/release", releaseStockController);

export { router as stockRouter };

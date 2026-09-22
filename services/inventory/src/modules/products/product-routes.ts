import { Router } from "express";
import {
  createProductController,
  deactivateProductController,
  getProductController,
  listProductsController,
  reactivateProductController,
  updateProductController
} from "./product-controller.js";

const router: Router = Router();

router.post("/", createProductController);
router.get("/", listProductsController);
router.get("/:id", getProductController);
router.patch("/:id", updateProductController);
router.patch("/:id/deactivate", deactivateProductController);
router.patch("/:id/reactivate", reactivateProductController);

export { router as productRouter };
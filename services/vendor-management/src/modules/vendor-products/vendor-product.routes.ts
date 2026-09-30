import { Router, type IRouter } from "express";

import {
  createVendorProductController,
  deactivateVendorProductController,
  getAllVendorProductsController,
  getVendorProductByIdController,
  getVendorProductsController,
  reactivateVendorProductController,
  updateVendorProductController,
} from "./vendor-product.controller.js";

const router: IRouter = Router();

router.post("/:vendorId/products", createVendorProductController);

router.get("/products", getAllVendorProductsController);
router.get("/:vendorId/products", getVendorProductsController);

router.get("/products/:id", getVendorProductByIdController);

router.patch("/products/:id", updateVendorProductController);

router.patch("/products/:id/deactivate", deactivateVendorProductController);

router.patch("/products/:id/reactivate", reactivateVendorProductController);

export default router;

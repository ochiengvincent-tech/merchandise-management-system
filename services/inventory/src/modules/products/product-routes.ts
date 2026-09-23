import { Router } from "express";

import { methodNotAllowed } from "../../middleware/method-not-allowed.js";

import {
  createProductController,
  deactivateProductController,
  getProductController,
  listProductsController,
  reactivateProductController,
  updateProductController,
} from "./product-controller.js";

const router: Router = Router();

router.post("/", createProductController);
router.get("/", listProductsController);
router.all("/", methodNotAllowed);

router.get("/:id", getProductController);
router.patch("/:id", updateProductController);
router.all("/:id", methodNotAllowed);

router.patch("/:id/deactivate", deactivateProductController);
router.all("/:id/deactivate", methodNotAllowed);

router.patch("/:id/reactivate", reactivateProductController);
router.all("/:id/reactivate", methodNotAllowed);

export { router as productRouter };

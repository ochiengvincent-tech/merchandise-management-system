import { Router, type IRouter } from "express";
import {
  createVendorController,
  deactivateVendorController,
  getVendorByIdController,
  getVendorReliabilityController,
  getVendorsController,
  reactivateVendorController,
  updateVendorController
} from "./vendor.controller.js";

const router: IRouter = Router();

router.post("/", createVendorController);
router.get("/", getVendorsController);
router.get("/:id/reliability", getVendorReliabilityController);
router.get("/:id", getVendorByIdController);
router.patch("/:id", updateVendorController);
router.patch("/:id/deactivate", deactivateVendorController);
router.patch("/:id/reactivate", reactivateVendorController);

export default router;
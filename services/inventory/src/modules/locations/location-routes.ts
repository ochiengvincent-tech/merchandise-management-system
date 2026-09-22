import { Router } from "express";
import {
  createLocationController,
  deactivateLocationController,
  getLocationController,
  listLocationsController,
  reactivateLocationController,
  updateLocationController
} from "./location-controller.js";

const router: Router = Router();

router.post("/", createLocationController);
router.get("/", listLocationsController);
router.get("/:id", getLocationController);
router.patch("/:id", updateLocationController);
router.patch("/:id/deactivate", deactivateLocationController);
router.patch("/:id/reactivate", reactivateLocationController);

export { router as locationRouter };
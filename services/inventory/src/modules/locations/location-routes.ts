import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  createLocationController,
  deactivateLocationController,
  getLocationController,
  enableWarehouseManagementController,
  listLocationsController,
  reactivateLocationController,
  updateLocationController,
} from "./location-controller.js";

const router: Router = Router();

router.post("/", createLocationController);
router.get("/", listLocationsController);
router.all("/", methodNotAllowed);

router.post("/:id/warehouse-management/enable", enableWarehouseManagementController);
router.all("/:id/warehouse-management/enable", methodNotAllowed);

router.get("/:id", getLocationController);
router.patch("/:id", updateLocationController);
router.all("/:id", methodNotAllowed);

router.patch("/:id/deactivate", deactivateLocationController);
router.all("/:id/deactivate", methodNotAllowed);

router.patch("/:id/reactivate", reactivateLocationController);
router.all("/:id/reactivate", methodNotAllowed);

export { router as locationRouter };

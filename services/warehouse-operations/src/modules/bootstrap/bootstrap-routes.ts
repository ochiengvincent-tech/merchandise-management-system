import { Router } from "express";
import { getLocationsLocationIdBootstrapController, postLocationsLocationIdBootstrapController } from "./bootstrap-controller.js";

const router: Router = Router();

router.get("/locations/:locationId/bootstrap", getLocationsLocationIdBootstrapController);
router.post("/locations/:locationId/bootstrap", postLocationsLocationIdBootstrapController);

export { router as bootstrapRouter };

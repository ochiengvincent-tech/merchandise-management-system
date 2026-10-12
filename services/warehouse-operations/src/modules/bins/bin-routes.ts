import { Router } from "express";
import { getLocationsLocationIdBinsController, postLocationsLocationIdBinsController, getBinsBinIdController, patchBinsBinIdController } from "./bin-controller.js";

const router: Router = Router();

router.get("/locations/:locationId/bins", getLocationsLocationIdBinsController);
router.post("/locations/:locationId/bins", postLocationsLocationIdBinsController);
router.get("/bins/:binId", getBinsBinIdController);
router.patch("/bins/:binId", patchBinsBinIdController);

export { router as binRouter };

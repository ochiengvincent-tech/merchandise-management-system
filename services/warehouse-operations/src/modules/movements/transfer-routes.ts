import { Router } from "express";
import { postMovementsController } from "./transfer-controller.js";

const router: Router = Router();

router.post("/movements", postMovementsController);

export { router as transferRouter };

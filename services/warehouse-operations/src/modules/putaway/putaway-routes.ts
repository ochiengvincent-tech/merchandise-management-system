import { Router } from "express";
import { getPutawayTasksController, getPutawayTasksTaskIdController, postPutawayTasksTaskIdLinesLineIdPutawayController } from "./putaway-controller.js";

const router: Router = Router();

router.get("/putaway-tasks", getPutawayTasksController);
router.get("/putaway-tasks/:taskId", getPutawayTasksTaskIdController);
router.post("/putaway-tasks/:taskId/lines/:lineId/putaway", postPutawayTasksTaskIdLinesLineIdPutawayController);

export { router as putawayRouter };

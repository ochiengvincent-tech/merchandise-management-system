import { Router } from "express";
import { getRegistersController, postSessionsController, getSessionsController, getSessionsIdController, getSessionsIdTransactionsController, postSessionsIdSubmitController, postSessionsIdReconcileController, postSessionsIdApproveController, postSessionsIdRejectController } from "./session-controller.js";

const sessionRouter: Router = Router();

sessionRouter.get("/registers", getRegistersController);
sessionRouter.post("/sessions", postSessionsController);
sessionRouter.get("/sessions", getSessionsController);
sessionRouter.get("/sessions/:id", getSessionsIdController);
sessionRouter.get("/sessions/:id/transactions", getSessionsIdTransactionsController);
sessionRouter.post("/sessions/:id/submit", postSessionsIdSubmitController);
sessionRouter.post("/sessions/:id/reconcile", postSessionsIdReconcileController);
sessionRouter.post("/sessions/:id/approve", postSessionsIdApproveController);
sessionRouter.post("/sessions/:id/reject", postSessionsIdRejectController);

export { sessionRouter as sessionRouter };

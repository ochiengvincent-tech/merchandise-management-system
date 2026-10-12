import { Router } from "express";
import { getRootController } from "./audit-controller.js";

const auditRouter: Router = Router();

auditRouter.get("/", getRootController);

export { auditRouter as auditRouter };

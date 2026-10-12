import { Router } from "express";
import { getAuditLogsController } from "./audit-controller.js";

const auditRouter: Router = Router();

auditRouter.get("/audit-logs", getAuditLogsController);

export { auditRouter as auditRouter };

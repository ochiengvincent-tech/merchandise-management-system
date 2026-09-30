import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import { listInventoryAuditLogsController } from "./audit-controller.js";

const router: Router = Router();
router.get("/", listInventoryAuditLogsController);
router.all("/", methodNotAllowed);
export { router as auditRouter };

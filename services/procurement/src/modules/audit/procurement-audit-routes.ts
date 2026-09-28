import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import { listProcurementAuditLogsController } from "./procurement-audit-controller.js";

const router: Router = Router();
router.get("/", listProcurementAuditLogsController);
router.all("/", methodNotAllowed);
export default router;

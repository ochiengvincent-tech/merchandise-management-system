import { Router } from "express";
import { listVendorAuditLogsController } from "./audit-list-controller.js";

const router: Router = Router();
router.get("/", listVendorAuditLogsController);
export default router;

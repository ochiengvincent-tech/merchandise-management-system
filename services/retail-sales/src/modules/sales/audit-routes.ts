import { Router } from "express";
import { getRootController } from "./audit-controller.js";

const router: Router = Router();

router.get("/", getRootController);

export { router as retailAuditRouter };

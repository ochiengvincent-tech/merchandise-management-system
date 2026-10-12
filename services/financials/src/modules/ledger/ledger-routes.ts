import { Router } from "express";
import { getAccountsController, postAccountsController, getPostingMappingsController, putPostingMappingsMappingKeyController, getJournalsController, getJournalsIdController, postJournalsIdReverseController, getReportsTrialBalanceController, getReportsIncomeStatementController, getReportsInventoryValueController, getPeriodsController, postPeriodsPeriodKeyCloseController, postPeriodsPeriodKeyReopenController, getPostingExceptionsController, postPostingExceptionsEventIdRetryController, getAuditLogsController } from "./ledger-controller.js";

const ledgerRouter: Router = Router();

ledgerRouter.get("/accounts", getAccountsController);
ledgerRouter.post("/accounts", postAccountsController);
ledgerRouter.get("/posting-mappings", getPostingMappingsController);
ledgerRouter.put("/posting-mappings/:mappingKey", putPostingMappingsMappingKeyController);
ledgerRouter.get("/journals", getJournalsController);
ledgerRouter.get("/journals/:id", getJournalsIdController);
ledgerRouter.post("/journals/:id/reverse", postJournalsIdReverseController);
ledgerRouter.get("/reports/trial-balance", getReportsTrialBalanceController);
ledgerRouter.get("/reports/income-statement", getReportsIncomeStatementController);
ledgerRouter.get("/reports/inventory-value", getReportsInventoryValueController);
ledgerRouter.get("/periods", getPeriodsController);
ledgerRouter.post("/periods/:periodKey/close", postPeriodsPeriodKeyCloseController);
ledgerRouter.post("/periods/:periodKey/reopen", postPeriodsPeriodKeyReopenController);
ledgerRouter.get("/posting-exceptions", getPostingExceptionsController);
ledgerRouter.post("/posting-exceptions/:eventId/retry", postPostingExceptionsEventIdRetryController);
ledgerRouter.get("/audit-logs", getAuditLogsController);

export { ledgerRouter as ledgerRouter };

import { Router } from "express";
import { getSupplierInvoicesController, getSupplierInvoicesIdController, postSupplierInvoicesController, postSupplierInvoicesIdMatchController, postSupplierInvoicesIdApproveController } from "./invoice-controller.js";

const invoiceRouter: Router = Router();

invoiceRouter.get("/supplier-invoices", getSupplierInvoicesController);
invoiceRouter.get("/supplier-invoices/:id", getSupplierInvoicesIdController);
invoiceRouter.post("/supplier-invoices", postSupplierInvoicesController);
invoiceRouter.post("/supplier-invoices/:id/match", postSupplierInvoicesIdMatchController);
invoiceRouter.post("/supplier-invoices/:id/approve", postSupplierInvoicesIdApproveController);

export { invoiceRouter as invoiceRouter };

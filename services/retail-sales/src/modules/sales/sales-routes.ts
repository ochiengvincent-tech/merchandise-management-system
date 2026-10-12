import { Router } from "express";
import { getRegistersController, postRegistersController, getProductsSearchController, getPricesController, putPricesProductIdController, postSalesController, getSalesAuditRegisterTotalsController, getSalesController, postSalesIdReturnsController, getSalesIdController } from "./sales-controller.js";

const retailSalesRouter: Router = Router();

retailSalesRouter.get("/registers", getRegistersController);
retailSalesRouter.post("/registers", postRegistersController);
retailSalesRouter.get("/products/search", getProductsSearchController);
retailSalesRouter.get("/prices", getPricesController);
retailSalesRouter.put("/prices/:productId", putPricesProductIdController);
retailSalesRouter.post("/sales", postSalesController);
retailSalesRouter.get("/sales-audit/register-totals", getSalesAuditRegisterTotalsController);
retailSalesRouter.get("/sales", getSalesController);
retailSalesRouter.post("/sales/:id/returns", postSalesIdReturnsController);
retailSalesRouter.get("/sales/:id", getSalesIdController);

export { retailSalesRouter as retailSalesRouter };

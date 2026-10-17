export const API_URLS = {
  inventory: "/api/inventory",
  vendor: "/api/vendor",
  procurement: "/api/procurement",
  receiving: "/api/receiving",
  warehouse: "/api/warehouse-operations",
  retailSales: "/api/retail-sales",
  salesAudit: "/api/sales-audit",
  financials: "/api/financials",
};

export let CURRENT_ACTOR_ID = "";

export function setCurrentActorId(employeeId: string) {
  CURRENT_ACTOR_ID = employeeId;
}

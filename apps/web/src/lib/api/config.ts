export const API_URLS = {
  inventory: import.meta.env.VITE_INVENTORY_API_URL || "/api/inventory",
  vendor: import.meta.env.VITE_VENDOR_API_URL || "/api/vendor",
  procurement: import.meta.env.VITE_PROCUREMENT_API_URL || "/api/procurement",
  receiving: import.meta.env.VITE_RECEIVING_API_URL || "/api/receiving",
  warehouse: import.meta.env.VITE_WAREHOUSE_API_URL || "/api/warehouse-operations",
};

export const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
export const CURRENT_ACTOR_ID =
  import.meta.env.VITE_CURRENT_ACTOR_ID ||
  "22222222-2222-4222-8222-222222222222";

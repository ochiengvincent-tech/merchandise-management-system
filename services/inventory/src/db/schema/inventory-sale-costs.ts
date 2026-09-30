import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.js";
import { inventoryLocations } from "./inventory-locations.js";

export const inventorySaleCosts = pgTable("inventory_sale_costs", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull().references(() => products.id),
  locationId: uuid("location_id").notNull().references(() => inventoryLocations.id),
  originalQuantity: integer("original_quantity").notNull(),
  originalCostMinor: bigint("original_cost_minor", { mode: "bigint" }).notNull(),
  returnedQuantity: integer("returned_quantity").notNull().default(0),
}, (t) => [
  unique("inventory_sale_costs_sale_product_location_unique").on(t.saleId, t.productId, t.locationId),
  index("inventory_sale_costs_sale_idx").on(t.saleId),
  check("inventory_sale_costs_quantity_check", sql`${t.originalQuantity} > 0 AND ${t.returnedQuantity} >= 0 AND ${t.returnedQuantity} <= ${t.originalQuantity}`),
  check("inventory_sale_costs_value_check", sql`${t.originalCostMinor} >= 0`),
]);

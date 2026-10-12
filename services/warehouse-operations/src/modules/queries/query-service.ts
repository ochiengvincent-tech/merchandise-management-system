import { getInventoryStockByLocation, requireManagedWarehouseLocation } from "../../clients/inventory-client.js";
import { findMovements, findSellableQuantities, findStock } from "./query-repository.js";

export async function listStock(query: Parameters<typeof findStock>[0]) {
  await requireManagedWarehouseLocation(query.locationId);
  return findStock(query);
}

export async function listMovements(query: Parameters<typeof findMovements>[0]) {
  await requireManagedWarehouseLocation(query.locationId);
  return findMovements(query);
}

export async function reconcileLocation(locationId: string) {
  await requireManagedWarehouseLocation(locationId);
  const [inventoryRows, warehouseRows] = await Promise.all([getInventoryStockByLocation(locationId), findSellableQuantities(locationId)]);
  const inventory = new Map(inventoryRows.map((row) => [row.productId, row.quantityOnHand]));
  const warehouse = new Map(warehouseRows.map((row) => [row.productId, Number(row.quantity ?? 0)]));
  const productIds = new Set([...inventory.keys(), ...warehouse.keys()]);
  const records = [...productIds].map((productId) => {
    const inventoryQuantity = inventory.get(productId) ?? 0;
    const warehouseQuantity = warehouse.get(productId) ?? 0;
    return { productId, inventoryQuantity, warehouseQuantity, variance: warehouseQuantity - inventoryQuantity };
  }).filter((record) => record.variance !== 0).sort((left, right) => left.productId.localeCompare(right.productId));
  return { locationId, calculatedAt: new Date().toISOString(), inBalance: records.length === 0, varianceCount: records.length, records };
}

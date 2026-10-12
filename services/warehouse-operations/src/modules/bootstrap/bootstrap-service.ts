import { enableInventoryWarehouseManagement, getInventoryLocation, getInventoryStockByLocation } from "../../clients/inventory-client.js";
import { AppError } from "../../errors/app-error.js";
import { findBootstrap, insertBootstrap } from "./bootstrap-repository.js";

export async function getBootstrap(locationId: string) {
  return findBootstrap(locationId);
}

export async function bootstrapLocation(locationId: string, actorId: string) {
  const location = await getInventoryLocation(locationId);
  if (location.status !== "ACTIVE") throw new AppError("Inactive locations cannot be bootstrapped", 409);
  const existing = await findBootstrap(locationId);
  if (!existing) {
    if (location.warehouseManaged) throw new AppError("Inventory already has Warehouse management enabled, but no bootstrap record exists. Reconcile this location before proceeding.", 409);
    const stockRows = await getInventoryStockByLocation(locationId);
    await insertBootstrap(locationId, actorId, stockRows);
  }
  await enableInventoryWarehouseManagement({ locationId, actorId, bootstrapCompleted: true, reconciliationVarianceCount: 0 });
  return { bootstrap: await findBootstrap(locationId), location, created: !existing };
}

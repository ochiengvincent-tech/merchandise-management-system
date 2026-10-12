import { AppError } from "../../errors/app-error.js";
import { getInventoryLocation } from "../../clients/inventory-client.js";
import { findBin, findBinForUpdate, findBins, insertBin, saveBinUpdate } from "./bin-repository.js";

export async function listBins(locationId: string, filters: { status?: "ACTIVE" | "INACTIVE"; search?: string }) {
  await getInventoryLocation(locationId);
  return findBins(locationId, filters);
}

export async function createBin(locationId: string, input: { code: string; name: string; binType: "STORAGE" | "PICK_FACE" | "QUARANTINE"; zone?: string; aisle?: string; rack?: string; shelf?: string; capacity?: number; actorId: string }) {
  const location = await getInventoryLocation(locationId);
  if (location.status !== "ACTIVE") throw new AppError("Inactive Inventory locations cannot have new bins", 409);
  if (!location.warehouseManaged) throw new AppError("Enable Warehouse Operations for this location before creating bins", 409);
  return insertBin({ ...input, locationId });
}

export async function getBin(binId: string) {
  const result = await findBin(binId);
  if (!result) throw new AppError("Warehouse bin not found", 404);
  return result;
}

export async function updateBin(binId: string, input: { name?: string; status?: "ACTIVE" | "INACTIVE"; zone?: string | null; aisle?: string | null; rack?: string | null; shelf?: string | null; capacity?: number | null; actorId: string }) {
  const existing = await findBinForUpdate(binId);
  if (!existing) throw new AppError("Warehouse bin not found", 404);
  if (existing.bin.systemManaged && input.status === "INACTIVE") throw new AppError("System-managed bins cannot be deactivated", 409);
  if (input.status === "INACTIVE" && existing.quantity > 0) throw new AppError("Bins with stock cannot be deactivated", 409);
  const { actorId, ...changes } = input;
  const updated = await saveBinUpdate({ binId, actorId, locationId: existing.bin.locationId, before: existing.bin, changes });
  if (!updated) throw new AppError("Warehouse bin not found", 404);
  return updated;
}

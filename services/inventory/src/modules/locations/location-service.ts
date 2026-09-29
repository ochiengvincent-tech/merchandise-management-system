import { AppError } from "../../errors/app-error.js";
import {
  createLocationWithGeneratedCode,
  findLocationById,
  findLocations,
  updateLocation,
  updateLocationStatus,
} from "./location-repository.js";
import { createLocationAuditLog } from "./location-audit-repository.js";

export const createLocationService = async (
  data: Parameters<typeof createLocationWithGeneratedCode>[0],
) => {
  const location = await createLocationWithGeneratedCode(data);
  if (location) {
    await createLocationAuditLog({
      locationId: location.id,
      action: "LOCATION_CREATED",
      details: { after: location },
    });
  }
  return location;
};

export const getLocationService = async (id: string) => {
  const location = await findLocationById(id);

  if (!location) {
    throw new AppError("Location not found", 404);
  }

  return location;
};

export const listLocationsService = async (filters: {
  search?: string;
  locationType?: string;
  status?: string;
}) => {
  return findLocations(filters);
};

export const updateLocationService = async (
  id: string,
  data: Parameters<typeof updateLocation>[1],
) => {
  const existingLocation = await findLocationById(id);

  if (!existingLocation) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Location not found",
      },
    ]);
  }

  const location = await updateLocation(id, data);

  if (location) {
    await createLocationAuditLog({
      locationId: location.id,
      action: "LOCATION_UPDATED",
      details: {
        before: existingLocation,
        after: location,
      },
    });
  }

  return location;
};

export const deactivateLocationService = async (id: string) => {
  const existingLocation = await findLocationById(id);

  if (!existingLocation) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Location not found",
      },
    ]);
  }

  if (existingLocation.status === "INACTIVE") {
    throw new AppError("Validation failed", 400, [
      {
        field: "status",
        message: "Location is already inactive",
      },
    ]);
  }

  const location = await updateLocationStatus(id, "INACTIVE");

  if (location) {
    await createLocationAuditLog({
      locationId: location.id,
      action: "LOCATION_DEACTIVATED",
      details: {
        before: existingLocation,
        after: location,
      },
    });
  }

  return location;
};

export const reactivateLocationService = async (id: string) => {
  const existingLocation = await findLocationById(id);

  if (!existingLocation) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Location not found",
      },
    ]);
  }

  if (existingLocation.status === "ACTIVE") {
    throw new AppError("Validation failed", 400, [
      {
        field: "status",
        message: "Location is already active",
      },
    ]);
  }

  const location = await updateLocationStatus(id, "ACTIVE");

  if (location) {
    await createLocationAuditLog({
      locationId: location.id,
      action: "LOCATION_REACTIVATED",
      details: {
        before: existingLocation,
        after: location,
      },
    });
  }

  return location;
};

export const enableWarehouseManagementService = async (
  id: string,
  data: { actorId: string; bootstrapCompleted: true; reconciliationVarianceCount: number },
) => {
  const existingLocation = await findLocationById(id);
  if (!existingLocation) throw new AppError("Location not found", 404);
  if (existingLocation.status !== "ACTIVE") {
    throw new AppError("Inactive locations cannot be warehouse-managed", 409);
  }
  if (data.reconciliationVarianceCount !== 0) {
    throw new AppError("Resolve all reconciliation variances before enabling Warehouse Operations", 409, [{ field: "reconciliationVarianceCount", message: "The location must reconcile with zero variance." }]);
  }
  if (existingLocation.warehouseManaged) {
    // Warehouse retries this call if its bootstrap transaction committed but
    // the Inventory response was lost. Treat an already-enabled location as
    // success so the retry cannot strand the bootstrap workflow.
    return existingLocation;
  }
  const location = await updateLocation(id, { warehouseManaged: true });
  if (!location) throw new Error("Could not enable Warehouse management");
  await createLocationAuditLog({
    locationId: id,
    actorId: data.actorId,
    action: "WAREHOUSE_MANAGEMENT_ENABLED",
    details: {
      before: { warehouseManaged: existingLocation.warehouseManaged },
      after: { warehouseManaged: location.warehouseManaged },
      bootstrapCompleted: data.bootstrapCompleted,
      reconciliationVarianceCount: data.reconciliationVarianceCount,
    },
  });
  return location;
};

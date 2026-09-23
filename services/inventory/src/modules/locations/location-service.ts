import { AppError } from "../../errors/app-error.js";
import {
  createLocation,
  findLocationByCode,
  findLocationById,
  findLocations,
  updateLocation,
  updateLocationStatus,
} from "./location-repository.js";
import { createLocationAuditLog } from "./location-audit-repository.js";

export const createLocationService = async (
  data: Parameters<typeof createLocation>[0],
) => {
  const existingLocation = await findLocationByCode(data.locationCode);

  if (existingLocation) {
    throw new AppError("Validation failed", 400, [
      {
        field: "locationCode",
        message: "Location code already exists",
      },
    ]);
  }

  return createLocation(data);
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

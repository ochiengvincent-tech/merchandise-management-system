import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import {
  locationSchema,
  locationsSchema,
  type Location,
} from "./types";

export type LocationFilters = {
  search?: string;
  locationType?: "WAREHOUSE" | "STORE";
  status?: "ACTIVE" | "INACTIVE";
};

export type CreateLocationInput = {
  locationCode: string;
  name: string;
  locationType: "WAREHOUSE" | "STORE";
};

export type UpdateLocationInput = {
  name?: string;
  locationType?: "WAREHOUSE" | "STORE";
};

export async function getLocations(
  filters: LocationFilters = {},
): Promise<Location[]> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.locationType) {
    params.set("locationType", filters.locationType);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  const query = params.toString();
  const url = `${API_URLS.inventory}/locations${query ? `?${query}` : ""}`;

  const data = await apiRequest<unknown>(url);

  return locationsSchema.parse(data);
}

export async function getLocation(id: string): Promise<Location> {
  const data = await apiRequest<unknown>(
    `${API_URLS.inventory}/locations/${id}`,
  );

  return locationSchema.parse(data);
}

export async function createLocation(
  data: CreateLocationInput,
): Promise<Location> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/locations`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );

  return locationSchema.parse(response);
}

export async function updateLocation(
  id: string,
  data: UpdateLocationInput,
): Promise<Location> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/locations/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

  return locationSchema.parse(response);
}

export async function deactivateLocation(id: string): Promise<Location> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/locations/${id}/deactivate`,
    {
      method: "PATCH",
    },
  );

  return locationSchema.parse(response);
}

export async function reactivateLocation(id: string): Promise<Location> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/locations/${id}/reactivate`,
    {
      method: "PATCH",
    },
  );

  return locationSchema.parse(response);
}
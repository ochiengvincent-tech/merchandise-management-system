import type { Request, Response } from "express";
import {
  createLocationService,
  deactivateLocationService,
  getLocationService,
  listLocationsService,
  reactivateLocationService,
  updateLocationService
} from "./location-service.js";
import {
  createLocationSchema,
  listLocationsSchema,
  updateLocationSchema
} from "./location-schema.js";

export const createLocationController = async (
  req: Request,
  res: Response
) => {
  const data = createLocationSchema.parse(req.body);

  const location = await createLocationService(data);

  return res.status(201).json(location);
};

export const getLocationController = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Location ID is required");
  }

  const location = await getLocationService(id);

  return res.status(200).json(location);
};

export const listLocationsController = async (
  req: Request,
  res: Response
) => {
  const filters = listLocationsSchema.parse(req.query);

  const locations = await listLocationsService(filters);

  return res.status(200).json(locations);
};
export const updateLocationController = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Location ID is required");
  }

  const data = updateLocationSchema.parse(req.body);

  const location = await updateLocationService(id, data);

  return res.status(200).json(location);
};
export const deactivateLocationController = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Location ID is required");
  }

  const location = await deactivateLocationService(id);

  return res.status(200).json(location);
};

export const reactivateLocationController = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Location ID is required");
  }

  const location = await reactivateLocationService(id);

  return res.status(200).json(location);
};
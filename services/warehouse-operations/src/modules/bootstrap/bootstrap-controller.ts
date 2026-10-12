import type { RequestHandler } from "express";
import { z } from "zod";
import { bootstrapLocation, getBootstrap } from "./bootstrap-service.js";

export const getLocationsLocationIdBootstrapController: RequestHandler = async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  return res.status(200).json({ data: await getBootstrap(locationId) });
};

export const postLocationsLocationIdBootstrapController: RequestHandler = async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const { actorId } = z.object({ actorId: z.uuid() }).parse(req.body);
  const result = await bootstrapLocation(locationId, actorId);
  return res.status(result.created ? 201 : 200).json({ data: result.bootstrap, location: result.location });
};

import type { RequestHandler } from "express";
import { z } from "zod";
import { createBin, getBin, listBins, updateBin } from "./bin-service.js";
const binTypeSchema = z.enum(["STORAGE", "PICK_FACE", "QUARANTINE"]);
const createBinSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(255),
  binType: binTypeSchema,
  zone: z.string().trim().max(100).optional(),
  aisle: z.string().trim().max(50).optional(),
  rack: z.string().trim().max(50).optional(),
  shelf: z.string().trim().max(50).optional(),
  capacity: z.coerce.number().int().nonnegative().optional(),
  actorId: z.uuid(),
});

const updateBinSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  zone: z.string().trim().max(100).nullable().optional(),
  aisle: z.string().trim().max(50).nullable().optional(),
  rack: z.string().trim().max(50).nullable().optional(),
  shelf: z.string().trim().max(50).nullable().optional(),
  capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  actorId: z.uuid(),
}).refine((data) => Object.keys(data).some((key) => key !== "actorId"), { message: "Provide at least one bin field to update." });






export const getLocationsLocationIdBinsController: RequestHandler = async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const search = z.string().trim().optional().parse(req.query.search);
  const status = z.enum(["ACTIVE", "INACTIVE"]).optional().parse(req.query.status);
  const bins = await listBins(locationId, { status, search });
  return res.status(200).json({ data: bins });
};

export const postLocationsLocationIdBinsController: RequestHandler = async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const data = createBinSchema.parse(req.body);
  const bin = await createBin(locationId, data);
  return res.status(201).json({ data: bin });
};

export const getBinsBinIdController: RequestHandler = async (req, res) => {
  const binId = z.uuid().parse(req.params.binId);
  return res.status(200).json({ data: await getBin(binId) });
};

export const patchBinsBinIdController: RequestHandler = async (req, res) => {
  const binId = z.uuid().parse(req.params.binId);
  const data = updateBinSchema.parse(req.body);
  const updated = await updateBin(binId, data);
  return res.status(200).json({ data: updated });
};

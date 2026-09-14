import type { Request, Response, NextFunction } from "express";
import {
  createVendorService,
  deactivateVendorService,
  getVendorByIdService,
  getVendorsService,
  reactivateVendorService,
  updateVendorService,
} from "./vendor.service.js";
import {
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
} from "./vendor.schema.js";
import { z } from "zod";

const systemActorId = process.env.SYSTEM_ACTOR_ID;

export async function createVendorController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!systemActorId) {
      throw new Error("SYSTEM_ACTOR_ID is not configured");
    }

    const data = createVendorSchema.parse(req.body);

    const vendor = await createVendorService(data, systemActorId);

    return res.status(201).json({
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
}

export async function getVendorsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = listVendorsQuerySchema.parse(req.query);
    const result = await getVendorsService(query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getVendorByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsedId = z.uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const id = parsedId.data;

    const vendor = await getVendorByIdService(id);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(200).json({
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateVendorController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!systemActorId) {
      throw new Error("SYSTEM_ACTOR_ID is not configured");
    }

    const parsedId = z.uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const id = parsedId.data;

    const data = updateVendorSchema.parse(req.body);

    const vendor = await updateVendorService(id, data, systemActorId);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(200).json({
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateVendorController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!systemActorId) {
      throw new Error("SYSTEM_ACTOR_ID is not configured");
    }
    const parsedId = z.uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const id = parsedId.data;

    const vendor = await deactivateVendorService(id, systemActorId);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(200).json({
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
}

export async function reactivateVendorController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!systemActorId) {
      throw new Error("SYSTEM_ACTOR_ID is not configured");
    }
    const parsedId = z.uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const id = parsedId.data;
    const vendor = await reactivateVendorService(id, systemActorId);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(200).json({
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
}

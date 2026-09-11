import type { Request, Response, NextFunction } from "express";
import {
  createVendorService,
  deactivateVendorService,
  getVendorByIdService,
  getVendorsService,
  reactivateVendorService,
  updateVendorService
} from "./vendor.service.js";
import { createVendorSchema, updateVendorSchema } from "./vendor.schema.js";

export async function createVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createVendorSchema.parse(req.body);

    const vendor = await createVendorService(data);

    return res.status(201).json({
      data: vendor
    });
  } catch (error) {
    next(error);
  }
}

export async function getVendorsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : undefined;

    const search =
      typeof req.query.search === "string"
        ? req.query.search
        : undefined;

    const result = await getVendorsService({
      page,
      limit,
      status,
      search
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
export async function getVendorByIdController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID"
        }
      });
    }

    const vendor = await getVendorByIdService(id);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found"
        }
      });
    }

    return res.status(200).json({
      data: vendor
    });
  } catch (error) {
    next(error);
  }
}

export async function updateVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID"
        }
      });
    }

    const data = updateVendorSchema.parse(req.body);

    const vendor = await updateVendorService(id, data);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found"
        }
      });
    }

    return res.status(200).json({
      data: vendor
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID"
        }
      });
    }

    const vendor = await deactivateVendorService(id);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found"
        }
      });
    }

    return res.status(200).json({
      data: vendor
    });
  } catch (error) {
    next(error);
  }
}

export async function reactivateVendorController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID"
        }
      });
    }

    const vendor = await reactivateVendorService(id);

    if (!vendor) {
      return res.status(404).json({
        error: {
          message: "Vendor not found"
        }
      });
    }

    return res.status(200).json({
      data: vendor
    });
  } catch (error) {
    next(error);
  }
}
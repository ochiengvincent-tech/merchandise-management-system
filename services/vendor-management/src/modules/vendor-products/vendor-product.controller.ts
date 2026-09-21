import type { Request, Response, NextFunction } from "express";
import {
  createVendorProductService,
  deactivateVendorProductService,
  getVendorProductByIdService,
  getVendorProductsService,
  reactivateVendorProductService,
  updateVendorProductService,
} from "./vendor-product.service.js";
import {
  createVendorProductSchema,
  updateVendorProductSchema,
} from "./vendor-product.schema.js";
import { z } from "zod";

const systemActorId = process.env.SYSTEM_ACTOR_ID;

export async function createVendorProductController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!systemActorId) {
      throw new Error("SYSTEM_ACTOR_ID is not configured");
    }

    const parsedVendorId = z.uuid().safeParse(req.params.vendorId);
    if (!parsedVendorId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const vendorId = parsedVendorId.data;

    const data = createVendorProductSchema.parse(req.body);

    const result = await createVendorProductService(
      vendorId,
      data,
      systemActorId,
    );

    if (!result) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(201).json({
      data: result.vendorProduct,
    });
  } catch (error) {
    next(error);
  }
}

export async function getVendorProductsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsedVendorId = z.uuid().safeParse(req.params.vendorId);
    if (!parsedVendorId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }
    const vendorId = parsedVendorId.data;

    const vendorProducts = await getVendorProductsService(vendorId);

    if (!vendorProducts) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(200).json({
      data: vendorProducts,
    });
  } catch (error) {
    next(error);
  }
}

export async function getVendorProductByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsedId = z.uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        error: {
          message: "Invalid vendor product ID",
        },
      });
    }
    const id = parsedId.data;

    const vendorProduct = await getVendorProductByIdService(id);

    if (!vendorProduct) {
      return res.status(404).json({
        error: {
          message: "Vendor product not found",
        },
      });
    }

    return res.status(200).json({
      data: vendorProduct,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateVendorProductController(
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
      return res
        .status(400)
        .json({ error: { message: "Invalid vendor product ID" } });
    }
    const id = parsedId.data;
    const data = updateVendorProductSchema.parse(req.body);
    const vendorProduct = await updateVendorProductService(
      id,
      data,
      systemActorId,
    );
    if (!vendorProduct) {
      return res
        .status(404)
        .json({ error: { message: "Vendor product not found" } });
    }
    return res.status(200).json({ data: vendorProduct });
  } catch (error) {
    next(error);
  }
}

export async function deactivateVendorProductController(
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
      return res
        .status(400)
        .json({ error: { message: "Invalid vendor product ID" } });
    }
    const id = parsedId.data;
    const vendorProduct = await deactivateVendorProductService(
      id,
      systemActorId,
    );
    if (!vendorProduct) {
      return res
        .status(404)
        .json({ error: { message: "Vendor product not found" } });
    }
    return res.status(200).json({ data: vendorProduct });
  } catch (error) {
    next(error);
  }
}

export async function reactivateVendorProductController(
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
      return res
        .status(400)
        .json({ error: { message: "Invalid vendor product ID" } });
    }
    const id = parsedId.data;
    const vendorProduct = await reactivateVendorProductService(
      id,
      systemActorId,
    );
    if (!vendorProduct) {
      return res
        .status(404)
        .json({ error: { message: "Vendor product not found" } });
    }
    return res.status(200).json({ data: vendorProduct });
  } catch (error) {
    next(error);
  }
}

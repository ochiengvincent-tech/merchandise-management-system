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

export async function createVendorProductController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { vendorId } = req.params;

    if (typeof vendorId !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }

    const data = createVendorProductSchema.parse(req.body);

    const vendorProduct = await createVendorProductService(vendorId, data);

    if (!vendorProduct) {
      return res.status(404).json({
        error: {
          message: "Vendor not found",
        },
      });
    }

    return res.status(201).json({
      data: vendorProduct,
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
    const { vendorId } = req.params;

    if (typeof vendorId !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor ID",
        },
      });
    }

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
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor product ID",
        },
      });
    }

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
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor product ID",
        },
      });
    }

    const data = updateVendorProductSchema.parse(req.body);

    const vendorProduct = await updateVendorProductService(id, data);

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

export async function deactivateVendorProductController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor product ID",
        },
      });
    }

    const vendorProduct = await deactivateVendorProductService(id);

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

export async function reactivateVendorProductController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid vendor product ID",
        },
      });
    }

    const vendorProduct = await reactivateVendorProductService(id);

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

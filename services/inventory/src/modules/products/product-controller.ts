import type { Request, Response } from "express";
import {
  createProductService,
  deactivateProductService,
  getProductService,
  listProductsService,
  reactivateProductService,
  updateProductService,
} from "./product-service.js";
import {
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
} from "./product-schema.js";

export const createProductController = async (req: Request, res: Response) => {
  const data = createProductSchema.parse(req.body);

  const product = await createProductService(data);

  return res.status(201).json(product);
};
export const getProductController = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Product ID is required");
  }

  const product = await getProductService(id);
  return res.status(200).json(product);
};
export const listProductsController = async (req: Request, res: Response) => {
  const filters = listProductsSchema.parse(req.query);

  const products = await listProductsService(filters);

  return res.status(200).json(products);
};

export const updateProductController = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Product ID is required");
  }

  const data = updateProductSchema.parse(req.body);

  const product = await updateProductService(id, data);

  return res.status(200).json(product);
};

export const deactivateProductController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Product ID is required");
  }

  const product = await deactivateProductService(id);

  return res.status(200).json(product);
};

export const reactivateProductController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    throw new Error("Product ID is required");
  }

  const product = await reactivateProductService(id);

  return res.status(200).json(product);
};

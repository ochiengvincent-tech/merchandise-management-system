import { AppError } from "../../errors/app-error.js";
import { createProductAuditLog } from "./product-audit-repository.js";
import {
  createProduct,
  findProductById,
  findProductBySku,
  findProducts,
  updateProduct,
  updateProductStatus
} from "./product-repository.js";

export const createProductService = async (
  data: Parameters<typeof createProduct>[0]
) => {
  const existingProduct = await findProductBySku(data.sku);

  if (existingProduct) {
    throw new AppError("Validation failed", 400, [
      {
        field: "sku",
        message: "Product SKU already exists"
      }
    ]);
  }

  const product = await createProduct(data);

  if (product) {
    await createProductAuditLog({
      productId: product.id,
      action: "PRODUCT_CREATED"
    });
  }

  return product;
};

export const getProductService = async (id: string) => {
  const product = await findProductById(id);

  if (!product) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Product not found"
      }
    ]);
  }

  return product;
};

export const listProductsService = async (filters: {
  search?: string;
  status?: string;
  category?: string;
}) => {
  return findProducts(filters);
};

export const updateProductService = async (
  id: string,
  data: Parameters<typeof updateProduct>[1]
) => {
  const existingProduct = await findProductById(id);

  if (!existingProduct) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Product not found"
      }
    ]);
  }

  const product = await updateProduct(id, data);

  if (product) {
    await createProductAuditLog({
      productId: product.id,
      action: "PRODUCT_UPDATED",
      details: {
        before: existingProduct,
        after: product
      }
    });
  }

  return product;
};

export const deactivateProductService = async (id: string) => {
  const existingProduct = await findProductById(id);

  if (!existingProduct) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Product not found"
      }
    ]);
  }

  if (existingProduct.status === "INACTIVE") {
    throw new AppError("Validation failed", 400, [
      {
        field: "status",
        message: "Product is already inactive"
      }
    ]);
  }

  const product = await updateProductStatus(id, "INACTIVE");

  if (product) {
    await createProductAuditLog({
      productId: product.id,
      action: "PRODUCT_DEACTIVATED",
      details: {
        before: existingProduct,
        after: product
      }
    });
  }

  return product;
};

export const reactivateProductService = async (id: string) => {
  const existingProduct = await findProductById(id);

  if (!existingProduct) {
    throw new AppError("Validation failed", 400, [
      {
        field: "id",
        message: "Product not found"
      }
    ]);
  }

  if (existingProduct.status === "ACTIVE") {
    throw new AppError("Validation failed", 400, [
      {
        field: "status",
        message: "Product is already active"
      }
    ]);
  }

  const product = await updateProductStatus(id, "ACTIVE");

  if (product) {
    await createProductAuditLog({
      productId: product.id,
      action: "PRODUCT_REACTIVATED",
      details: {
        before: existingProduct,
        after: product
      }
    });
  }

  return product;
};
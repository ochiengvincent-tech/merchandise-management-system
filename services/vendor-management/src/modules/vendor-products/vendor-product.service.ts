import {
  createVendorProduct,
  findVendorProductById,
  findVendorProductByVendorAndProduct,
  listVendorProducts,
  updateVendorProduct,
  updateVendorProductStatus,
} from "./vendor-product.repository.js";
import {
  findVendorById,
} from "../vendors/vendor.repository.js";

export async function createVendorProductService(
  vendorId: string,
  data: {
    productId: string;
    supplierProductCode?: string | undefined;
    currentPrice: string;
    leadTimeDays: number;
  },
) {
  const vendor = await findVendorById(vendorId);

  if (!vendor) {
    return null;
  }

  if (vendor.status === "INACTIVE") {
    throw new Error("Cannot add product to an inactive vendor");
  }

  const existingVendorProduct =
    await findVendorProductByVendorAndProduct(
      vendorId,
      data.productId,
    );

  if (existingVendorProduct) {
    throw new Error("Vendor already supplies this product");
  }

  return createVendorProduct({
    vendorId,
    productId: data.productId,
    supplierProductCode: data.supplierProductCode,
    currentPrice: data.currentPrice,
    leadTimeDays: data.leadTimeDays,
  });
}

export async function getVendorProductByIdService(id: string) {
  return findVendorProductById(id);
}

export async function getVendorProductsService(vendorId: string) {
  const vendor = await findVendorById(vendorId);

  if (!vendor) {
    return null;
  }

  return listVendorProducts(vendorId);
}

export async function updateVendorProductService(
  id: string,
  data: {
    supplierProductCode?: string | undefined;
    currentPrice?: string | undefined;
    leadTimeDays?: number | undefined;
  },
) {
  const existingVendorProduct = await findVendorProductById(id);

  if (!existingVendorProduct) {
    return null;
  }

  return updateVendorProduct(id, data);
}

export async function deactivateVendorProductService(id: string) {
  const existingVendorProduct = await findVendorProductById(id);

  if (!existingVendorProduct) {
    return null;
  }

  if (existingVendorProduct.status === "INACTIVE") {
    throw new Error("Vendor product is already inactive");
  }

  return updateVendorProductStatus(id, "INACTIVE");
}

export async function reactivateVendorProductService(id: string) {
  const existingVendorProduct = await findVendorProductById(id);

  if (!existingVendorProduct) {
    return null;
  }

  if (existingVendorProduct.status === "ACTIVE") {
    throw new Error("Vendor product is already active");
  }

  return updateVendorProductStatus(id, "ACTIVE");
}

import {
  createVendorProductWithPriceWithDatabase,
  findVendorProductById,
  findVendorProductByVendorAndProduct,
  listVendorProducts,
  updateVendorProductStatusWithDatabase,
  updateVendorProductWithPriceWithDatabase,
} from "./vendor-product.repository.js";
import { findVendorById } from "../vendors/vendor.repository.js";
import { createAuditLogService } from "../audit/audit.service.js";
import { db } from "../../db/index.js";

export async function createVendorProductService(
  vendorId: string,
  data: {
    productId: string;
    supplierProductCode?: string | undefined;
    currentPrice: string;
    leadTimeDays: number;
  },
  actorId: string,
) {
  const vendor = await findVendorById(vendorId);
  if (!vendor) {
    return null;
  }
  if (vendor.status === "INACTIVE") {
    throw new Error("Cannot add product to an inactive vendor");
  }
  const existingVendorProduct = await findVendorProductByVendorAndProduct(
    vendorId,
    data.productId,
  );
  if (existingVendorProduct) {
    throw new Error("Vendor already supplies this product");
  }
  const effectiveFrom = new Date();
  return db.transaction(async (tx) => {
    const result = await createVendorProductWithPriceWithDatabase(
      {
        vendorId,
        productId: data.productId,
        supplierProductCode: data.supplierProductCode,
        currentPrice: data.currentPrice,
        leadTimeDays: data.leadTimeDays,
      },
      data.currentPrice,
      effectiveFrom,
      tx,
    );
    await createAuditLogService(
      {
        vendorId,
        vendorProductId: result.vendorProduct.id,
        action: "VENDOR_PRODUCT_ADDED",
        actorId,
        beforeState: null,
        afterState: result.vendorProduct,
      },
      tx,
    );
    return result;
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
  actorId: string,
) {
  const existingVendorProduct = await findVendorProductById(id);
  if (!existingVendorProduct) {
    return null;
  }
  return db.transaction(async (tx) => {
    const result = await updateVendorProductWithPriceWithDatabase(id, data, tx);
    if (!result.vendorProduct) {
      throw new Error("Failed to update vendor product");
    }
    if (result.priceChanged) {
      await createAuditLogService(
        {
          vendorId: result.vendorProduct.vendorId,
          vendorProductId: result.vendorProduct.id,
          action: "SUPPLIER_PRICE_CHANGED",
          actorId,
          beforeState: {
            ...existingVendorProduct,
            currentPrice: result.previousPrice,
          },
          afterState: result.vendorProduct,
        },
        tx,
      );
    } else {
      await createAuditLogService(
        {
          vendorId: result.vendorProduct.vendorId,
          vendorProductId: result.vendorProduct.id,
          action: "VENDOR_PRODUCT_UPDATED",
          actorId,
          beforeState: existingVendorProduct,
          afterState: result.vendorProduct,
        },
        tx,
      );
    }
    return result.vendorProduct;
  });
}

export async function deactivateVendorProductService(
  id: string,
  actorId: string,
) {
  const existingVendorProduct = await findVendorProductById(id);

  if (!existingVendorProduct) {
    return null;
  }

  if (existingVendorProduct.status === "INACTIVE") {
    throw new Error("Vendor product is already inactive");
  }

  return db.transaction(async (tx) => {
    const vendorProduct = await updateVendorProductStatusWithDatabase(
      id,
      "INACTIVE",
      tx,
    );

    if (!vendorProduct) {
      throw new Error("Failed to deactivate vendor product");
    }

    await createAuditLogService(
      {
        vendorId: vendorProduct.vendorId,
        vendorProductId: vendorProduct.id,
        action: "VENDOR_PRODUCT_DEACTIVATED",
        actorId,
        beforeState: existingVendorProduct,
        afterState: vendorProduct,
      },
      tx,
    );

    return vendorProduct;
  });
}

export async function reactivateVendorProductService(
  id: string,
  actorId: string,
) {
  const existingVendorProduct = await findVendorProductById(id);
  if (!existingVendorProduct) {
    return null;
  }
  if (existingVendorProduct.status === "ACTIVE") {
    throw new Error("Vendor product is already active");
  }
  return db.transaction(async (tx) => {
    const vendorProduct = await updateVendorProductStatusWithDatabase(
      id,
      "ACTIVE",
      tx,
    );
    if (!vendorProduct) {
      throw new Error("Failed to reactivate vendor product");
    }
    await createAuditLogService(
      {
        vendorId: vendorProduct.vendorId,
        vendorProductId: vendorProduct.id,
        action: "VENDOR_PRODUCT_REACTIVATED",
        actorId,
        beforeState: existingVendorProduct,
        afterState: vendorProduct,
      },
      tx,
    );
    return vendorProduct;
  });
}

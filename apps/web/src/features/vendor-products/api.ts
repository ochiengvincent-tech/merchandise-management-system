import { apiRequest } from "../../lib/api/client";
import { API_URLS } from "../../lib/api/config";
import {
  vendorProductListResponseSchema,
  vendorProductResponseSchema,
  type VendorProduct,
} from "./types";

export type CreateVendorProductInput = {
  productId: string;
  supplierProductCode?: string;
  currentPrice: number;
  leadTimeDays: number;
};

export type UpdateVendorProductInput = {
  supplierProductCode?: string;
  currentPrice?: number;
  leadTimeDays?: number;
};

export async function getVendorProducts(
  vendorId: string,
): Promise<VendorProduct[]> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${vendorId}/products`,
  );

  return vendorProductListResponseSchema.parse(response).data;
}

export async function getVendorProduct(id: string): Promise<VendorProduct> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/products/${id}`,
  );

  return vendorProductResponseSchema.parse(response).data;
}

export async function createVendorProduct(
  vendorId: string,
  data: CreateVendorProductInput,
): Promise<VendorProduct> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${vendorId}/products`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );

  return vendorProductResponseSchema.parse(response).data;
}

export async function updateVendorProduct(
  id: string,
  data: UpdateVendorProductInput,
): Promise<VendorProduct> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/products/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

  return vendorProductResponseSchema.parse(response).data;
}

export async function deactivateVendorProduct(
  id: string,
): Promise<VendorProduct> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/products/${id}/deactivate`,
    {
      method: "PATCH",
    },
  );

  return vendorProductResponseSchema.parse(response).data;
}

export async function reactivateVendorProduct(
  id: string,
): Promise<VendorProduct> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/products/${id}/reactivate`,
    {
      method: "PATCH",
    },
  );

  return vendorProductResponseSchema.parse(response).data;
}

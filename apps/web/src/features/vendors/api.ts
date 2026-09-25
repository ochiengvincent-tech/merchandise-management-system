import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import {
  vendorListResponseSchema,
  vendorResponseSchema,
  type Vendor,
} from "./types";

export type VendorFilters = {
  page?: number;
  limit?: number;
  status?: "ACTIVE" | "INACTIVE";
  search?: string;
};

export type CreateVendorInput = {
  vendorCode: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
};

export type UpdateVendorInput = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
};

export type VendorListResponse = {
  data: Vendor[];
  total: number;
};

export async function getVendors(
  filters: VendorFilters = {},
): Promise<VendorListResponse> {
  const params = new URLSearchParams();

  if (filters.page !== undefined) {
    params.set("page", String(filters.page));
  }

  if (filters.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.search) {
    params.set("search", filters.search);
  }

  const query = params.toString();
  const url = `${API_URLS.vendor}/vendors${query ? `?${query}` : ""}`;

  const response = await apiRequest<unknown>(url);

  return vendorListResponseSchema.parse(response);
}

export async function getVendor(id: string): Promise<Vendor> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${id}`,
  );

  return vendorResponseSchema.parse(response).data;
}

export async function createVendor(
  data: CreateVendorInput,
): Promise<Vendor> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );

  return vendorResponseSchema.parse(response).data;
}

export async function updateVendor(
  id: string,
  data: UpdateVendorInput,
): Promise<Vendor> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

  return vendorResponseSchema.parse(response).data;
}

export async function deactivateVendor(id: string): Promise<Vendor> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${id}/deactivate`,
    {
      method: "PATCH",
    },
  );

  return vendorResponseSchema.parse(response).data;
}

export async function reactivateVendor(id: string): Promise<Vendor> {
  const response = await apiRequest<unknown>(
    `${API_URLS.vendor}/vendors/${id}/reactivate`,
    {
      method: "PATCH",
    },
  );

  return vendorResponseSchema.parse(response).data;
}
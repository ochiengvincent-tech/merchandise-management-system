import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import { productSchema, productsSchema, type Product } from "./types";

type ProductFilters = {
  search?: string;
  status?: "ACTIVE" | "INACTIVE";
  category?: string;
};
export type CreateProductInput = {
  sku: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasure: string;
  barcode?: string;
  reorderLevel?: number;
};

export type UpdateProductInput = {
  name?: string;
  description?: string;
  category?: string;
  unitOfMeasure?: string;
  barcode?: string;
  reorderLevel?: number;
};

export async function getProducts(
  filters: ProductFilters = {},
): Promise<Product[]> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  const query = params.toString();
  const url = `${API_URLS.inventory}/products${query ? `?${query}` : ""}`;

  const data = await apiRequest<unknown>(url);

  return productsSchema.parse(data);
}

export async function createProduct(
  data: CreateProductInput,
): Promise<Product> {
  const response = await apiRequest<unknown>(`${API_URLS.inventory}/products`, {
    method: "POST",
    body: JSON.stringify(data),
  });

  return productSchema.parse(response);
}

export async function getProduct(id: string): Promise<Product> {
  const data = await apiRequest<unknown>(
    `${API_URLS.inventory}/products/${id}`,
  );

  return productSchema.parse(data);
}

export async function updateProduct(
  id: string,
  data: UpdateProductInput,
): Promise<Product> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/products/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

  return productSchema.parse(response);
}

export async function deactivateProduct(id: string): Promise<Product> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/products/${id}/deactivate`,
    {
      method: "PATCH",
    },
  );

  return productSchema.parse(response);
}

export async function reactivateProduct(id: string): Promise<Product> {
  const response = await apiRequest<unknown>(
    `${API_URLS.inventory}/products/${id}/reactivate`,
    {
      method: "PATCH",
    },
  );

  return productSchema.parse(response);
}
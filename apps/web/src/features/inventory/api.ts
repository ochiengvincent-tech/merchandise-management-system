import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import {
  stocksSchema,
  stockSchema,
  type Stock,
} from "./types";

export async function getStockByProduct(
  productId: string,
): Promise<Stock[]> {
  const data = await apiRequest<unknown>(
    `${API_URLS.inventory}/stock/by-product?productId=${encodeURIComponent(productId)}`,
  );

  return stocksSchema.parse(data);
}

export async function getStockByLocation(
  locationId: string,
): Promise<Stock[]> {
  const data = await apiRequest<unknown>(
    `${API_URLS.inventory}/stock/by-location?locationId=${encodeURIComponent(locationId)}`,
  );

  return stocksSchema.parse(data);
}

export async function getStockByProductAndLocation(
  productId: string,
  locationId: string,
): Promise<Stock> {
  const params = new URLSearchParams({
    productId,
    locationId,
  });

  const data = await apiRequest<unknown>(
    `${API_URLS.inventory}/stock/by-product-and-location?${params.toString()}`,
  );

  return stockSchema.parse(data);
}
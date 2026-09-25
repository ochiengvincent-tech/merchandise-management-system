import { useQuery } from "@tanstack/react-query";
import {
  getStockByLocation,
  getStockByProduct,
  getStockByProductAndLocation,
} from "./api";

export function useStockByProduct(productId: string) {
  return useQuery({
    queryKey: ["stock", "product", productId],
    queryFn: () => getStockByProduct(productId),
    enabled: Boolean(productId),
  });
}

export function useStockByLocation(locationId: string) {
  return useQuery({
    queryKey: ["stock", "location", locationId],
    queryFn: () => getStockByLocation(locationId),
    enabled: Boolean(locationId),
  });
}

export function useStockByProductAndLocation(
  productId: string,
  locationId: string,
) {
  return useQuery({
    queryKey: ["stock", "product", productId, "location", locationId],
    queryFn: () => getStockByProductAndLocation(productId, locationId),
    enabled: Boolean(productId && locationId),
  });
}
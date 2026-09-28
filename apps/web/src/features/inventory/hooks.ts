import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAdjustmentInput } from "./types";
import {
  getStockByLocation,
  getStockByProduct,
  getStockByProductAndLocation,
  createAdjustment,
  getInventoryValuation,
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
export function useCreateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAdjustmentInput) => createAdjustment(data),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["stock", "product", result.stock.productId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["stock", "location", result.stock.locationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["stock", "product", result.stock.productId, "location", result.stock.locationId],
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}

export function useInventoryValuation() {
  return useQuery({ queryKey: ["inventory", "valuation"], queryFn: getInventoryValuation });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProduct, deactivateProduct, getProduct, getProducts, reactivateProduct, updateProduct } from "./api";

type ProductFilters = {
  search?: string;
  status?: "ACTIVE" | "INACTIVE";
  category?: string;
};

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => getProducts(filters),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["products"],
      });
    },
  });
}
export function useProduct(id: string) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateProduct>[1];
    }) => updateProduct(id, data),
    onSuccess: async (product) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["products"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["product", product.id],
        }),
      ]);
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateProduct,
    onSuccess: async (product) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["products"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["product", product.id],
        }),
      ]);
    },
  });
}

export function useReactivateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reactivateProduct,
    onSuccess: async (product) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["products"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["product", product.id],
        }),
      ]);
    },
  });
}
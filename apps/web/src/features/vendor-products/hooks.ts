import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createVendorProduct,
  deactivateVendorProduct,
  getVendorProduct,
  getVendorProducts,
  reactivateVendorProduct,
  updateVendorProduct,
  type CreateVendorProductInput,
  type UpdateVendorProductInput,
} from "./api";

export function useVendorProducts(vendorId: string) {
  return useQuery({
    queryKey: ["vendor-products", vendorId],
    queryFn: () => getVendorProducts(vendorId),
    enabled: Boolean(vendorId),
  });
}

export function useVendorProduct(id: string) {
  return useQuery({
    queryKey: ["vendor-product", id],
    queryFn: () => getVendorProduct(id),
    enabled: Boolean(id),
  });
}

export function useCreateVendorProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vendorId,
      data,
    }: {
      vendorId: string;
      data: CreateVendorProductInput;
    }) => createVendorProduct(vendorId, data),
    onSuccess: async (vendorProduct) => {
      await queryClient.invalidateQueries({
        queryKey: ["vendor-products", vendorProduct.vendorId],
      });
    },
  });
}

export function useUpdateVendorProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateVendorProductInput;
    }) => updateVendorProduct(id, data),
    onSuccess: async (vendorProduct) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendor-products", vendorProduct.vendorId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor-product", vendorProduct.id],
        }),
      ]);
    },
  });
}

export function useDeactivateVendorProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateVendorProduct,
    onSuccess: async (vendorProduct) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendor-products", vendorProduct.vendorId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor-product", vendorProduct.id],
        }),
      ]);
    },
  });
}

export function useReactivateVendorProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reactivateVendorProduct,
    onSuccess: async (vendorProduct) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendor-products", vendorProduct.vendorId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor-product", vendorProduct.id],
        }),
      ]);
    },
  });
}
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createVendor,
  deactivateVendor,
  getVendor,
  getVendors,
  reactivateVendor,
  updateVendor,
  type CreateVendorInput,
  type UpdateVendorInput,
  type VendorFilters,
} from "./api";

export function useVendors(filters: VendorFilters = {}) {
  return useQuery({
    queryKey: ["vendors", filters],
    queryFn: () => getVendors(filters),
  });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendor(id),
    enabled: Boolean(id),
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVendorInput) => createVendor(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["vendors"],
      });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateVendorInput;
    }) => updateVendor(id, data),
    onSuccess: async (vendor) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendors"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor", vendor.id],
        }),
      ]);
    },
  });
}

export function useDeactivateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateVendor,
    onSuccess: async (vendor) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendors"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor", vendor.id],
        }),
      ]);
    },
  });
}

export function useReactivateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reactivateVendor,
    onSuccess: async (vendor) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["vendors"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["vendor", vendor.id],
        }),
      ]);
    },
  });
}
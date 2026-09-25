import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createLocation,
  deactivateLocation,
  getLocation,
  getLocations,
  reactivateLocation,
  updateLocation,
  type CreateLocationInput,
  type LocationFilters,
  type UpdateLocationInput,
} from "./api";

export function useLocations(filters: LocationFilters = {}) {
  return useQuery({
    queryKey: ["locations", filters],
    queryFn: () => getLocations(filters),
  });
}

export function useLocation(id: string) {
  return useQuery({
    queryKey: ["location", id],
    queryFn: () => getLocation(id),
    enabled: Boolean(id),
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLocationInput) => createLocation(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["locations"],
      });
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateLocationInput;
    }) => updateLocation(id, data),
    onSuccess: async (location) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["locations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["location", location.id],
        }),
      ]);
    },
  });
}

export function useDeactivateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateLocation,
    onSuccess: async (location) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["locations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["location", location.id],
        }),
      ]);
    },
  });
}

export function useReactivateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reactivateLocation,
    onSuccess: async (location) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["locations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["location", location.id],
        }),
      ]);
    },
  });
}
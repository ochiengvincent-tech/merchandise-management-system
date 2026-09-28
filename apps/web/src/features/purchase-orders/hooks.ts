import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { getLocation } from "../locations/api";
import { getProduct } from "../products/api";
import { getVendor } from "../vendors/api";
import {
  createPurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  approvePurchaseOrderAmendment,
  getPurchaseOrderAmendments,
  rejectPurchaseOrderAmendment,
  receivePurchaseOrder,
  requestPurchaseOrderAmendment,
  getPurchaseOrder,
  getPurchaseOrderPolicy,
  listPurchaseOrders,
  updatePurchaseOrder,
  type CreatePurchaseOrderInput,
  type RequestPurchaseOrderAmendmentInput,
  type UpdatePurchaseOrderInput,
} from "./api";

type ListPurchaseOrdersParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export const usePurchaseOrders = (params: ListPurchaseOrdersParams = {}) =>
  useQuery({
    queryKey: ["purchase-orders", params],
    queryFn: () => listPurchaseOrders(params),
  });

export const usePurchaseOrder = (id: string) =>
  useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => getPurchaseOrder(id),
    enabled: Boolean(id),
  });

export const usePurchaseOrderPolicy = () =>
  useQuery({
    queryKey: ["purchase-order-policy"],
    queryFn: getPurchaseOrderPolicy,
  });

export const useCreatePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseOrderInput) => createPurchaseOrder(data),
    onSuccess: async (purchaseOrder) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders", purchaseOrder.data.purchaseOrder.id],
        }),
      ]);
    },
  });
};

export const useUpdatePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdatePurchaseOrderInput;
    }) => updatePurchaseOrder(id, data),
    onSuccess: async (purchaseOrder) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders", purchaseOrder.id],
        }),
      ]);
    },
  });
};

const invalidatePurchaseOrders = (
  queryClient: ReturnType<typeof useQueryClient>,
) => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });

export const useSubmitPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitPurchaseOrder,
    onSuccess: () => invalidatePurchaseOrders(queryClient),
  });
};

export const useApprovePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approvePurchaseOrder,
    onSuccess: () => invalidatePurchaseOrders(queryClient),
  });
};

export const useRejectPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      rejectPurchaseOrder(id, comments),
    onSuccess: () => invalidatePurchaseOrders(queryClient),
  });
};

export const useSendPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendPurchaseOrder,
    onSuccess: () => invalidatePurchaseOrders(queryClient),
  });
};

export const useCancelPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelPurchaseOrder(id, reason),
    onSuccess: () => invalidatePurchaseOrders(queryClient),
  });
};

export const useReceivePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: string;
      items: Array<{ purchaseOrderLineId: string; quantityReceived: number }>;
    }) => receivePurchaseOrder(id, items),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-orders", result.purchaseOrder.id],
        }),
      ]);
    },
  });
};

export const usePurchaseOrderAmendments = (purchaseOrderId: string) =>
  useQuery({
    queryKey: ["purchase-order-amendments", purchaseOrderId],
    queryFn: () => getPurchaseOrderAmendments(purchaseOrderId),
    enabled: Boolean(purchaseOrderId),
  });

const invalidatePurchaseOrderAndAmendments = async (
  queryClient: ReturnType<typeof useQueryClient>,
  purchaseOrderId: string,
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
    queryClient.invalidateQueries({
      queryKey: ["purchase-order-amendments", purchaseOrderId],
    }),
  ]);

export const useRequestPurchaseOrderAmendment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RequestPurchaseOrderAmendmentInput) =>
      requestPurchaseOrderAmendment(data),
    onSuccess: (amendment) =>
      invalidatePurchaseOrderAndAmendments(
        queryClient,
        amendment.purchaseOrderId,
      ),
  });
};

export const useApprovePurchaseOrderAmendment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approvePurchaseOrderAmendment,
    onSuccess: ({ amendment }) =>
      invalidatePurchaseOrderAndAmendments(
        queryClient,
        amendment.purchaseOrderId,
      ),
  });
};

export const useRejectPurchaseOrderAmendment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      rejectPurchaseOrderAmendment(id, comments),
    onSuccess: (amendment) =>
      invalidatePurchaseOrderAndAmendments(
        queryClient,
        amendment.purchaseOrderId,
      ),
  });
};

export const usePurchaseOrderReferences = (
  vendorIds: string[],
  locationIds: string[],
  productIds: string[] = [],
) => {
  const vendorQueries = useQueries({
    queries: vendorIds.map((id) => ({
      queryKey: ["vendor", id],
      queryFn: () => getVendor(id),
      enabled: Boolean(id),
    })),
  });

  const locationQueries = useQueries({
    queries: locationIds.map((id) => ({
      queryKey: ["location", id],
      queryFn: () => getLocation(id),
      enabled: Boolean(id),
    })),
  });

  const productQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["product", id],
      queryFn: () => getProduct(id),
      enabled: Boolean(id),
    })),
  });

  const vendors = new Map(
    vendorIds.map((id, index) => [id, vendorQueries[index]?.data]),
  );

  const locations = new Map(
    locationIds.map((id, index) => [id, locationQueries[index]?.data]),
  );

  const products = new Map(
    productIds.map((id, index) => [id, productQueries[index]?.data]),
  );

  return {
    vendors,
    locations,
    products,
    isLoading:
      vendorQueries.some((query) => query.isLoading) ||
      locationQueries.some((query) => query.isLoading) ||
      productQueries.some((query) => query.isLoading),
    isError:
      vendorQueries.some((query) => query.isError) ||
      locationQueries.some((query) => query.isError) ||
      productQueries.some((query) => query.isError),
  };
};

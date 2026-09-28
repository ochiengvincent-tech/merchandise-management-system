import {
  API_URLS,
  CURRENT_ACTOR_ID,
  SYSTEM_ACTOR_ID,
} from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";

import {
  purchaseOrderCreateResponseSchema,
  purchaseOrderActionResponseSchema,
  purchaseOrderAmendmentApprovalResponseSchema,
  purchaseOrderAmendmentResponseSchema,
  purchaseOrderAmendmentsResponseSchema,
  purchaseOrderAmendmentQueueResponseSchema,
  reorderSuggestionsResponseSchema,
  reorderSuggestionResponseSchema,
  type ReorderSuggestion,
  purchaseOrderListResponseSchema,
  purchaseOrderPolicyResponseSchema,
  purchaseOrderResponseSchema,
  type PurchaseOrderCreateResponse,
  type PurchaseOrderListResponse,
  type PurchaseOrderAmendmentQueueResponse,
  type PurchaseOrderResponse,
} from "./types";

type ListPurchaseOrdersParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export type CreatePurchaseOrderLineInput = {
  productId: string;
  quantityOrdered: number;
};

export type CreatePurchaseOrderInput = {
  poNumber: string;
  vendorId: string;
  destinationLocationId: string;
  requestedDeliveryDate?: string;
  currency?: string;
  lines: CreatePurchaseOrderLineInput[];
  notes?: string;
};

export type UpdatePurchaseOrderInput = {
  poNumber?: string;
  vendorId?: string;
  destinationLocationId?: string;
  requestedDeliveryDate?: string | null;
  notes?: string | null;
  lines?: CreatePurchaseOrderLineInput[];
};


export type RequestPurchaseOrderAmendmentInput = {
  purchaseOrderId: string;
  reason: string;
  notes?: string;
  destinationLocationId?: string;
};

export const listPurchaseOrders = async ({
  page = 1,
  limit = 20,
  status,
  search,
}: ListPurchaseOrdersParams = {}): Promise<PurchaseOrderListResponse> => {
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (status) {
    params.set("status", status);
  }

  if (search) {
    params.set("search", search);
  }

  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders?${params.toString()}`,
  );

  return purchaseOrderListResponseSchema.parse(response);
};

export const getPurchaseOrder = async (
  id: string,
): Promise<PurchaseOrderResponse> => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}`,
  );

  return purchaseOrderResponseSchema.parse(response);
};

export const getPurchaseOrderPolicy = async () => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/policy`,
  );

  return purchaseOrderPolicyResponseSchema.parse(response);
};

export const createPurchaseOrder = async (
  data: CreatePurchaseOrderInput,
): Promise<PurchaseOrderCreateResponse> => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders`,
    {
      method: "POST",
      body: JSON.stringify({
        ...data,
        createdBy: SYSTEM_ACTOR_ID,
      }),
    },
  );

  return purchaseOrderCreateResponseSchema.parse(response);
};

export const updatePurchaseOrder = async (
  id: string,
  data: UpdatePurchaseOrderInput,
) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...data, actorId: CURRENT_ACTOR_ID }),
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const submitPurchaseOrder = async (id: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}/submit`,
    {
      method: "PATCH",
      body: JSON.stringify({ actorId: CURRENT_ACTOR_ID }),
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const approvePurchaseOrder = async (id: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}/approve`,
    {
      method: "PATCH",
      body: JSON.stringify({ approverId: CURRENT_ACTOR_ID }),
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const rejectPurchaseOrder = async (id: string, comments?: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}/reject`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approverId: CURRENT_ACTOR_ID,
        comments,
      }),
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const sendPurchaseOrder = async (id: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}/send`,
    {
      method: "PATCH",
      headers: { "x-actor-id": CURRENT_ACTOR_ID },
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const cancelPurchaseOrder = async (id: string, reason: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/purchase-orders/${id}/cancel`,
    {
      method: "PATCH",
      headers: { "x-actor-id": CURRENT_ACTOR_ID },
      body: JSON.stringify({ reason }),
    },
  );

  return purchaseOrderActionResponseSchema.parse(response).data;
};

export const listPurchaseOrderAmendmentQueue = async ({
  page = 1,
  limit = 20,
  status,
}: {
  page?: number;
  limit?: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
} = {}): Promise<PurchaseOrderAmendmentQueueResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set("status", status);
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/amendments?${params.toString()}`,
  );
  return purchaseOrderAmendmentQueueResponseSchema.parse(response);
};

export const getPurchaseOrderAmendments = async (purchaseOrderId: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/amendments/purchase-orders/${purchaseOrderId}`,
  );

  return purchaseOrderAmendmentsResponseSchema.parse(response).data;
};

export const requestPurchaseOrderAmendment = async ({
  purchaseOrderId,
  ...data
}: RequestPurchaseOrderAmendmentInput) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/amendments/purchase-orders/${purchaseOrderId}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...data,
        requestedBy: CURRENT_ACTOR_ID,
      }),
    },
  );

  return purchaseOrderAmendmentResponseSchema.parse(response).data;
};

export const approvePurchaseOrderAmendment = async (id: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/amendments/${id}/approve`,
    {
      method: "PATCH",
      body: JSON.stringify({ approverId: CURRENT_ACTOR_ID }),
    },
  );

  return purchaseOrderAmendmentApprovalResponseSchema.parse(response).data;
};

export const rejectPurchaseOrderAmendment = async (
  id: string,
  comments?: string,
) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/amendments/${id}/reject`,
    {
      method: "PATCH",
      body: JSON.stringify({ approverId: CURRENT_ACTOR_ID, comments }),
    },
  );

  return purchaseOrderAmendmentResponseSchema.parse(response).data;
};

export const listReorderSuggestions = async (): Promise<ReorderSuggestion[]> => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/reorder-suggestions`,
  );

  return reorderSuggestionsResponseSchema.parse(response).data;
};

export const convertReorderSuggestion = async (
  id: string,
  purchaseOrderId: string,
) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/reorder-suggestions/${id}/convert`,
    {
      method: "PATCH",
      body: JSON.stringify({ purchaseOrderId }),
    },
  );

  return reorderSuggestionResponseSchema.parse(response).data;
};

export const dismissReorderSuggestion = async (id: string) => {
  const response = await apiRequest<unknown>(
    `${API_URLS.procurement}/reorder-suggestions/${id}/dismiss`,
    { method: "PATCH" },
  );

  return reorderSuggestionResponseSchema.parse(response).data;
};

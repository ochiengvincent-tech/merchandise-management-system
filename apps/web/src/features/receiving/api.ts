import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";
import {
  goodsReceiptListResponseSchema,
  goodsReceiptResponseSchema,
  openPurchaseOrdersResponseSchema,
  receivingPurchaseOrderSchema,
  type GoodsReceipt,
} from "./types";

export type RecordGoodsReceiptInput = {
  purchaseOrderId: string;
  supplierDeliveryNote?: string;
  notes?: string;
  lines: Array<{
    purchaseOrderLineId?: string;
    productId: string;
    productCode: string;
    quantityObserved: number;
    quantityDamaged: number;
    notes?: string;
  }>;
};

export async function listOpenPurchaseOrders(input: {
  page?: number;
  limit?: number;
  search?: string;
} = {}) {
  const query = new URLSearchParams({
    page: String(input.page ?? 1),
    limit: String(input.limit ?? 20),
  });
  if (input.search) query.set("search", input.search);

  const response = await apiRequest<unknown>(
    `${API_URLS.receiving}/purchase-orders/open?${query.toString()}`,
  );
  return openPurchaseOrdersResponseSchema.parse(response);
}

export async function getReceivingPurchaseOrder(id: string) {
  const response = await apiRequest<unknown>(
    `${API_URLS.receiving}/purchase-orders/${id}`,
  );
  return receivingPurchaseOrderSchema.parse(
    (response as { data: unknown }).data,
  );
}

export async function listGoodsReceipts(input: {
  page?: number;
  limit?: number;
  purchaseOrderId?: string;
  search?: string;
  discrepancy?: "SHORTAGE" | "OVERAGE" | "DAMAGE";
} = {}) {
  const query = new URLSearchParams({
    page: String(input.page ?? 1),
    limit: String(input.limit ?? 20),
  });
  if (input.purchaseOrderId) query.set("purchaseOrderId", input.purchaseOrderId);
  if (input.search) query.set("search", input.search);
  if (input.discrepancy) query.set("discrepancy", input.discrepancy);

  const response = await apiRequest<unknown>(
    `${API_URLS.receiving}/receipts?${query.toString()}`,
  );
  return goodsReceiptListResponseSchema.parse(response);
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const response = await apiRequest<unknown>(
    `${API_URLS.receiving}/receipts/${id}`,
  );
  return goodsReceiptResponseSchema.parse(response).data;
}

export async function recordGoodsReceipt(
  input: RecordGoodsReceiptInput,
  idempotencyKey: string,
): Promise<GoodsReceipt> {
  const response = await apiRequest<unknown>(`${API_URLS.receiving}/receipts`, {
    method: "POST",
    headers: {
      "x-actor-id": CURRENT_ACTOR_ID,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  return goodsReceiptResponseSchema.parse(response).data;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGoodsReceipt,
  getReceivingPurchaseOrder,
  listGoodsReceipts,
  listOpenPurchaseOrders,
  recordGoodsReceipt,
  type RecordGoodsReceiptInput,
} from "./api";

export function useOpenPurchaseOrders(input: {
  page?: number;
  limit?: number;
  search?: string;
} = {}) {
  return useQuery({
    queryKey: ["receiving", "open-purchase-orders", input],
    queryFn: () => listOpenPurchaseOrders(input),
  });
}

export function useReceivingPurchaseOrder(id: string) {
  return useQuery({
    queryKey: ["receiving", "purchase-orders", id],
    queryFn: () => getReceivingPurchaseOrder(id),
    enabled: Boolean(id),
  });
}

export function useGoodsReceipts(input: Parameters<typeof listGoodsReceipts>[0] = {}) {
  return useQuery({
    queryKey: ["receiving", "receipts", input],
    queryFn: () => listGoodsReceipts(input),
  });
}

export function useGoodsReceipt(id: string) {
  return useQuery({
    queryKey: ["receiving", "receipt", id],
    queryFn: () => getGoodsReceipt(id),
    enabled: Boolean(id),
  });
}

export function useRecordGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: RecordGoodsReceiptInput;
      idempotencyKey: string;
    }) => recordGoodsReceipt(input, idempotencyKey),
    onSuccess: async (receipt) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["receiving"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({
          queryKey: ["receiving", "purchase-orders", receipt.purchaseOrderId],
        }),
      ]);
    },
  });
}

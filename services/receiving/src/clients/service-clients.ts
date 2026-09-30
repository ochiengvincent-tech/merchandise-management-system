import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const purchaseOrderSchema = z.object({
  id: z.uuid(),
  poNumber: z.string(),
  status: z.string(),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  currency: z.string().length(3),
  lines: z.array(
    z.object({
      id: z.uuid(),
      productId: z.uuid(),
      quantityOrdered: z.number().int().nonnegative(),
      quantityReceived: z.number().int().nonnegative(),
      unitPrice: z.union([z.string(), z.number()]),
    }),
  ),
});

const purchaseOrderSummarySchema = z.object({
  id: z.uuid(),
  poNumber: z.string(),
  status: z.enum(["SENT", "PARTIALLY_RECEIVED"]),
  vendorId: z.uuid(),
  destinationLocationId: z.uuid(),
  requestedDeliveryDate: z.string().nullable(),
  createdAt: z.string(),
});

const productSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  barcode: z.string().nullable().optional(),
  status: z.string(),
});

async function request(url: string, init?: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError("A required service is unavailable; try again shortly", 503);
  }
}

export async function getPurchaseOrder(purchaseOrderId: string) {
  const response = await request(
    `${env.PROCUREMENT_API_URL}/purchase-orders/${purchaseOrderId}`,
  );
  if (response.status === 404) throw new AppError("Purchase order not found", 404);
  if (!response.ok) {
    throw new AppError("Procurement could not validate the purchase order", 502);
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = z
    .object({ data: purchaseOrderSchema })
    .safeParse(body);
  if (!parsed.success) {
    throw new AppError("Procurement returned an invalid purchase order response", 502);
  }
  return parsed.data.data;
}

export async function listOpenPurchaseOrders(input: {
  page: number;
  limit: number;
  search?: string;
}) {
  const query = new URLSearchParams({
    status: "SENT,PARTIALLY_RECEIVED",
    page: String(input.page),
    limit: String(input.limit),
  });
  if (input.search) query.set("search", input.search);

  const response = await request(
    `${env.PROCUREMENT_API_URL}/purchase-orders?${query.toString()}`,
  );
  if (!response.ok) {
    throw new AppError("Procurement could not load open purchase orders", 502);
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = z
    .object({
      data: z.array(purchaseOrderSummarySchema),
      pagination: z.object({
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    })
    .safeParse(body);
  if (!parsed.success) {
    throw new AppError("Procurement returned an invalid purchase order list", 502);
  }
  return parsed.data;
}

export async function getActiveProductById(productId: string) {
  const response = await request(
    `${env.INVENTORY_API_URL}/products/${productId}`,
  );
  if (response.status === 404) {
    throw new AppError("Product was not found in Inventory", 404, [
      { field: "productId", message: "Select an existing inventory product." },
    ]);
  }
  if (!response.ok) {
    throw new AppError("Inventory could not validate the product", 502);
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("Inventory returned an invalid product response", 502);
  }

  const product = parsed.data;
  if (product.id !== productId) {
    throw new AppError("Inventory returned a different product", 502);
  }
  if (product.status !== "ACTIVE") {
    throw new AppError("Product is inactive", 409, [
      { field: "productId", message: "Inactive products cannot be received." },
    ]);
  }
  return product;
}

export async function getActiveProduct(productId: string, productCode: string) {
  const product = await getActiveProductById(productId);
  if (product.sku !== productCode && product.barcode !== productCode) {
    throw new AppError("Scanned product code does not match the selected product", 409, [
      { field: "productCode", message: "Check the SKU or barcode and scan again." },
    ]);
  }
  return product;
}

export type AcceptedReceiptItem = {
  purchaseOrderLineId: string;
  quantityReceived: number;
};

export async function reportAcceptedQuantities(input: {
  purchaseOrderId: string;
  receivingReceiptId: string;
  actorId: string;
  items: AcceptedReceiptItem[];
}) {
  if (input.items.length === 0) return;

  const response = await request(
    `${env.PROCUREMENT_API_URL}/purchase-orders/${input.purchaseOrderId}/receipts/from-receiving`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-id": input.actorId,
      },
      body: JSON.stringify({
        receivingReceiptId: input.receivingReceiptId,
        items: input.items,
      }),
    },
  );

  if (response.ok) return;

  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; details?: { field?: string; message: string }[] };
  } | null;
  if (response.status >= 500) {
    throw new AppError(
      "The GRN is saved, but Procurement synchronization is pending. Retry using the same idempotency key.",
      503,
    );
  }
  throw new AppError(
    body?.error?.message ?? "Procurement rejected the received quantities",
    response.status,
    body?.error?.details ?? [],
  );
}

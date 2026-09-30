import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const inventoryLocationSchema = z.object({
  id: z.uuid(),
  locationCode: z.string(),
  name: z.string(),
  locationType: z.enum(["WAREHOUSE", "STORE"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  warehouseManaged: z.boolean().default(false),
});

const inventoryProductSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

async function inventoryGet(path: string) {
  let response: Response;
  try {
    response = await fetch(`${env.INVENTORY_API_URL}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError("Inventory service is unavailable", 503);
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 404) throw new AppError("Inventory record not found", 404);
  if (!response.ok) throw new AppError("Inventory service request failed", 503);
  return body;
}

export async function getInventoryLocation(locationId: string) {
  const body = await inventoryGet(`/locations/${locationId}`);
  const parsed = inventoryLocationSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Inventory returned an invalid location response", 502);
  return parsed.data;
}

export async function getInventoryProduct(productId: string) {
  const body = await inventoryGet(`/products/${productId}`);
  const parsed = inventoryProductSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Inventory returned an invalid product response", 502);
  return parsed.data;
}

export async function requireManagedWarehouseLocation(locationId: string) {
  const location = await getInventoryLocation(locationId);
  if (location.status !== "ACTIVE") throw new AppError("Inventory location is inactive", 409);
  if (!location.warehouseManaged) {
    throw new AppError("Warehouse Operations is not enabled for this location", 409);
  }
  return location;
}

export async function submitInventoryWarehouseAdjustment(input: {
  productId: string;
  locationId: string;
  quantityChange: number;
  reason: string;
  createdBy: string;
  idempotencyKey: string;
  warehouseCommandId: string;
  sourceBinId: string;
}) {
  let response: Response;
  try {
    response = await fetch(`${env.INVENTORY_API_URL}/stock/adjustments/from-warehouse`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    throw new AppError("Inventory did not confirm the adjustment. Retry this same Warehouse command.", 503);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ message: z.string().optional() }).optional() }).safeParse(body);
    throw new AppError(parsed.success ? parsed.data.error?.message ?? "Inventory rejected the adjustment" : "Inventory rejected the adjustment", response.status >= 500 ? 503 : response.status);
  }
  return body;
}

const inventoryStockRowSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  locationId: z.uuid(),
  quantityOnHand: z.number().int().nonnegative(),
});

export async function getInventoryStockByLocation(locationId: string) {
  const body = await inventoryGet(`/stock/by-location?locationId=${encodeURIComponent(locationId)}`);
  const parsed = z.array(inventoryStockRowSchema).safeParse(body);
  if (!parsed.success) throw new AppError("Inventory returned an invalid stock snapshot", 502);
  return parsed.data;
}

export async function enableInventoryWarehouseManagement(input: {
  locationId: string;
  actorId: string;
  bootstrapCompleted: true;
  reconciliationVarianceCount: 0;
}) {
  let response: Response;
  try {
    response = await fetch(`${env.INVENTORY_API_URL}/locations/${input.locationId}/warehouse-management/enable`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        actorId: input.actorId,
        bootstrapCompleted: input.bootstrapCompleted,
        reconciliationVarianceCount: input.reconciliationVarianceCount,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError("Stock was imported, but Inventory could not enable Warehouse management yet. Retry bootstrap to finish.", 503);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = z.object({ error: z.object({ message: z.string().optional() }).optional() }).safeParse(body);
    throw new AppError(parsed.success ? parsed.data.error?.message ?? "Inventory rejected Warehouse activation" : "Inventory rejected Warehouse activation", response.status >= 500 ? 503 : response.status);
  }
  return response.json();
}

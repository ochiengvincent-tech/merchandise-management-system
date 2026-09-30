import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
const locationSchema = z.object({ id: z.uuid(), name: z.string(), locationCode: z.string(), locationType: z.enum(["STORE", "WAREHOUSE"]), status: z.enum(["ACTIVE", "INACTIVE"]), warehouseManaged: z.boolean().default(false) });
const productSchema = z.object({ id: z.uuid(), sku: z.string(), name: z.string(), barcode: z.string().nullable().optional(), status: z.enum(["ACTIVE", "INACTIVE"]) });
async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(`${env.INVENTORY_API_URL}${path}`, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }, signal: AbortSignal.timeout(7000) }); }
  catch { throw new AppError("Inventory service is unavailable", 503); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ error: z.object({ message: z.string().optional() }).optional() }).safeParse(body);
    throw new AppError(message.success ? message.data.error?.message ?? "Inventory request failed" : "Inventory request failed", response.status === 404 ? 404 : response.status >= 500 ? 503 : response.status);
  }
  return body;
}
export async function inventoryLocation(id: string) {
  const result = locationSchema.safeParse(await request(`/locations/${id}`));
  if (!result.success) throw new AppError("Inventory returned an invalid location", 502);
  return result.data;
}
export async function inventoryProduct(id: string) {
  const result = productSchema.safeParse(await request(`/products/${id}`));
  if (!result.success) throw new AppError("Inventory returned an invalid product", 502);
  return result.data;
}
export async function searchInventoryProducts(search: string) {
  const result = z.array(productSchema).safeParse(await request(`/products?status=ACTIVE&search=${encodeURIComponent(search)}`));
  if (!result.success) throw new AppError("Inventory returned an invalid product list", 502);
  return result.data;
}
export async function inventoryStockAtLocation(locationId: string) {
  const result = z.array(z.object({ productId: z.uuid(), quantityAvailable: z.number().int().nonnegative() })).safeParse(await request(`/stock/by-location?locationId=${encodeURIComponent(locationId)}`));
  if (!result.success) throw new AppError("Inventory returned an invalid stock list", 502);
  return result.data;
}
export async function reserveInventoryStock(input: { reservationId: string; saleId: string; productId: string; locationId: string; quantity: number; actorId: string }) {
  return request("/stock/sale-reservations", { method: "POST", headers: { "Idempotency-Key": input.reservationId }, body: JSON.stringify(input) });
}
export async function releaseInventoryStock(reservationId: string, actorId: string) {
  try { return await request(`/stock/sale-reservations/${reservationId}/release`, { method: "POST", body: JSON.stringify({ actorId }) }); }
  catch (error) { if (error instanceof AppError && error.statusCode === 404) return null; throw error; }
}

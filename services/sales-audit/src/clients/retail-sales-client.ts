import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const registerSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), inventoryLocationId: z.uuid() });
const registerListSchema = z.object({ data: z.array(registerSchema) });
const totalsSchema = z.object({
  registerId: z.uuid(), from: z.iso.datetime(), to: z.iso.datetime(), currency: z.string().length(3), snapshotAt: z.iso.datetime(),
  saleCount: z.number().int().nonnegative(), returnCount: z.number().int().nonnegative(),
  tenderTotals: z.record(z.string(), z.object({ saleMinor: z.number().int().nonnegative(), refundMinor: z.number().int().nonnegative() })),
});
export type RetailRegister = z.infer<typeof registerSchema>;
export type RetailTotals = z.infer<typeof totalsSchema>;

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.RETAIL_SALES_API_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new AppError("Retail Sales is unavailable; reconciliation cannot be completed", 503);
  }
  if (!response.ok) throw new AppError(`Retail Sales returned HTTP ${response.status}`, response.status === 404 ? 404 : 503);
  const body = await response.json() as { data?: unknown };
  const parsed = schema.safeParse(body?.data ?? body);
  if (!parsed.success) throw new AppError("Retail Sales returned an invalid response", 502);
  return parsed.data;
}

export async function listRetailRegisters() {
  return (await get("/registers", registerListSchema)).data;
}

export async function getRetailTotals(registerId: string, from: Date, to: Date): Promise<RetailTotals> {
  const query = new URLSearchParams({ registerId, from: from.toISOString(), to: to.toISOString() });
  return get(`/sales-audit/register-totals?${query}`, totalsSchema);
}

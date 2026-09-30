import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const poSchema = z.object({ data: z.object({ id: z.uuid(), poNumber: z.string(), vendorId: z.uuid(), currency: z.string(), status: z.string(), approvedAt: z.string().nullable().optional(), lines: z.array(z.object({ id: z.uuid(), productId: z.uuid(), unitPrice: z.union([z.string(), z.number()]), quantityOrdered: z.number(), quantityReceived: z.number().optional() })) }) });
const receiptSchema = z.object({ data: z.object({ id: z.uuid(), purchaseOrderId: z.uuid(), lines: z.array(z.object({ id: z.uuid(), purchaseOrderLineId: z.uuid().nullable(), productId: z.uuid(), quantityAccepted: z.number() })) }) });
async function sourceGet<T>(baseUrl: string, path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try { response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1${path}`, { signal: AbortSignal.timeout(5000) }); }
  catch { throw new AppError("Source documents are temporarily unavailable. Please try again shortly.", 503); }
  if (!response.ok) throw new AppError("A referenced purchasing document could not be verified. Please try again shortly.", 503);
  let body: unknown;
  try { body = await response.json(); } catch { throw new AppError("A source service returned an unreadable response.", 502); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("A source service returned an unexpected document format.", 502);
  return parsed.data;
}
export async function getPurchaseOrderForInvoice(id: string) { return (await sourceGet(env.PROCUREMENT_API_URL, `/purchase-orders/${id}`, poSchema)).data; }
export async function getGoodsReceiptForInvoice(id: string) { return (await sourceGet(env.RECEIVING_API_URL, `/receipts/${id}`, receiptSchema)).data; }

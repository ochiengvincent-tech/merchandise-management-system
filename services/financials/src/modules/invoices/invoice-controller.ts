import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { approveSupplierInvoiceService, createSupplierInvoiceService, getSupplierInvoiceService, listSupplierInvoicesService, matchSupplierInvoiceService } from "./invoice-service.js";

const uuid = z.uuid();
const minorString = z.string().regex(/^\d+$/).refine((value) => BigInt(value) <= 9_000_000_000_000_000n, "Amount is too large");
const bodySchema = z.object({
  vendorId: uuid,
  invoiceNumber: z.string().trim().min(1).max(100),
  invoiceDate: z.iso.date(),
  dueDate: z.iso.date().optional(),
  currency: z.literal("KES"),
  taxMinor: minorString,
  totalMinor: minorString,
  attachmentReference: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ purchaseOrderId: uuid, purchaseOrderLineId: uuid, goodsReceiptId: uuid, goodsReceiptLineId: uuid, productId: uuid, quantity: z.number().int().positive(), unitPriceMinor: minorString, taxMinor: minorString, lineTotalMinor: minorString })).min(1),
});

function actorId(req: { header(name: string): string | undefined }) {
  const parsed = uuid.safeParse(req.header("x-actor-id"));
  if (!parsed.success) throw new AppError("A valid actor ID is required", 400, [{ field: "x-actor-id", message: "Provide a valid UUID." }]);
  return parsed.data;
}

function invoiceResponse(invoice: { totalMinor: bigint; taxMinor: bigint }) {
  return { ...invoice, totalMinor: invoice.totalMinor.toString(), taxMinor: invoice.taxMinor.toString() };
}

export const getSupplierInvoicesController: RequestHandler = async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(["DRAFT", "MATCHED", "EXCEPTION", "POSTED"]).optional(), vendorId: uuid.optional() }).parse(req.query);
  const { data, total } = await listSupplierInvoicesService(query);
  return res.json({ data: data.map(invoiceResponse), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
};

export const getSupplierInvoicesIdController: RequestHandler = async (req, res) => {
  const result = await getSupplierInvoiceService(uuid.parse(req.params.id));
  if (!result) throw new AppError("Supplier invoice not found", 404);
  return res.json({ data: { ...invoiceResponse(result.invoice), lines: result.lines.map((line) => ({ ...line, unitPriceMinor: line.unitPriceMinor.toString(), taxMinor: line.taxMinor.toString(), lineTotalMinor: line.lineTotalMinor.toString() })) } });
};

export const postSupplierInvoicesController: RequestHandler = async (req, res) => {
  const key = uuid.safeParse(req.header("idempotency-key"));
  if (!key.success) throw new AppError("An idempotency key is required", 400, [{ field: "Idempotency-Key", message: "Provide a UUID and reuse it for retries." }]);
  const invoice = await createSupplierInvoiceService(bodySchema.parse(req.body), actorId(req), key.data);
  return res.status(201).json({ data: invoiceResponse(invoice) });
};

export const postSupplierInvoicesIdMatchController: RequestHandler = async (req, res) => {
  const invoice = await matchSupplierInvoiceService(uuid.parse(req.params.id), actorId(req));
  return res.json({ data: invoiceResponse(invoice) });
};

export const postSupplierInvoicesIdApproveController: RequestHandler = async (req, res) => {
  const invoice = await approveSupplierInvoiceService(uuid.parse(req.params.id), actorId(req));
  return res.json({ data: invoiceResponse(invoice) });
};

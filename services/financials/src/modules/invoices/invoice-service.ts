import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { getGoodsReceiptForInvoice, getPurchaseOrderForInvoice } from "../../clients/source-documents.js";
import { AppError } from "../../errors/app-error.js";
import { mappingAccount, postJournal, toMinorUnits } from "../ledger/posting-service.js";
import {
  approveSupplierInvoice,
  createSupplierInvoice,
  findSupplierInvoiceById,
  findSupplierInvoices,
  matchSupplierInvoice,
  type SupplierInvoiceInput,
} from "./invoice-repository.js";

export const listSupplierInvoicesService = findSupplierInvoices;
export const getSupplierInvoiceService = findSupplierInvoiceById;

export async function createSupplierInvoiceService(input: SupplierInvoiceInput, actorId: string, idempotencyKey: string) {
  const normalized = { ...input, invoiceNumber: input.invoiceNumber.trim().toUpperCase() };
  const lineTax = normalized.lines.reduce((sum, line) => sum + BigInt(line.taxMinor), 0n);
  const lineTotal = normalized.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n);
  for (const [index, line] of normalized.lines.entries()) {
    if (BigInt(line.lineTotalMinor) !== BigInt(line.unitPriceMinor) * BigInt(line.quantity) + BigInt(line.taxMinor)) throw new AppError("Invoice line total does not match quantity, price, and tax", 400, [{ field: `lines.${index}.lineTotalMinor`, message: "Use quantity × unit price + tax." }]);
  }
  if (lineTax !== BigInt(normalized.taxMinor) || lineTotal !== BigInt(normalized.totalMinor)) throw new AppError("Invoice totals do not match the line totals", 400, [{ field: "totalMinor", message: "Tax and invoice total must equal the sums of their lines." }]);
  const requestHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return createSupplierInvoice(normalized, actorId, idempotencyKey, requestHash);
}

export async function matchSupplierInvoiceService(id: string, actorId: string) {
  const details = await findSupplierInvoiceById(id);
  if (!details) throw new AppError("Supplier invoice not found", 404);
  const { invoice, lines } = details;
  if (invoice.status === "MATCHED" || invoice.status === "POSTED") return invoice;
  if (invoice.status !== "DRAFT" && invoice.status !== "EXCEPTION") throw new AppError("This invoice cannot be matched in its current state", 409);
  const refs = new Map<string, { po: Awaited<ReturnType<typeof getPurchaseOrderForInvoice>>; receipt: Awaited<ReturnType<typeof getGoodsReceiptForInvoice>> }>();
  const acceptedQuantityByReceiptLineId = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.purchaseOrderId}:${line.goodsReceiptId}`;
    if (!refs.has(key)) refs.set(key, { po: await getPurchaseOrderForInvoice(line.purchaseOrderId), receipt: await getGoodsReceiptForInvoice(line.goodsReceiptId) });
    const { po, receipt } = refs.get(key)!;
    if (po.id !== line.purchaseOrderId || po.vendorId !== invoice.vendorId || po.currency.trim() !== invoice.currency || !po.approvedAt || ["CANCELLED", "CANCELED"].includes(po.status.toUpperCase())) throw new AppError("Invoice supplier, currency, or purchase order does not match the approved source document", 409, [{ field: "purchaseOrderId", message: `Purchase order ${po.poNumber} is not an eligible order for this invoice.` }]);
    if (receipt.purchaseOrderId !== po.id) throw new AppError("Goods receipt does not belong to the referenced purchase order", 409, [{ field: "goodsReceiptId", message: "Select a receipt for this purchase order." }]);
    const poLine = po.lines.find((item) => item.id === line.purchaseOrderLineId);
    const receiptLine = receipt.lines.find((item) => item.id === line.goodsReceiptLineId);
    if (!poLine || poLine.productId !== line.productId || !receiptLine || receiptLine.productId !== line.productId || receiptLine.purchaseOrderLineId !== poLine.id) throw new AppError("Invoice line references do not match the PO and receipt", 409, [{ field: "lines", message: `Invoice line ${line.lineNumber} does not match the source documents.` }]);
    if (line.quantity > receiptLine.quantityAccepted || BigInt(toMinorUnits(String(poLine.unitPrice))) !== line.unitPriceMinor) throw new AppError("Invoice quantity or price differs from the accepted receipt and approved PO", 409, [{ field: `lines.${line.lineNumber}`, message: "Invoice quantity must be received and unit price must match the approved PO." }]);
    acceptedQuantityByReceiptLineId.set(receiptLine.id, receiptLine.quantityAccepted);
  }
  return matchSupplierInvoice(id, actorId, lines, acceptedQuantityByReceiptLineId);
}

export async function approveSupplierInvoiceService(id: string, actorId: string) {
  if (!env.postingEnabled) throw new AppError("Invoice posting is not enabled yet", 409, [{ field: "status", message: "Financial posting must be enabled after the chart and account mappings are approved." }]);
  return approveSupplierInvoice(id, actorId, { mappingAccount, postJournal });
}

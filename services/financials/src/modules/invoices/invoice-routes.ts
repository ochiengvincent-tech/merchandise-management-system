import { createHash } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { financialAuditLogs, financialJournals, financialJournalLines, financialSupplierInvoiceLines, financialSupplierInvoices } from "../../db/schema/financials.js";
import { AppError } from "../../errors/app-error.js";
import { getGoodsReceiptForInvoice, getPurchaseOrderForInvoice } from "../../clients/source-documents.js";
import { PostingException, mappingAccount, postJournal, toMinorUnits } from "../ledger/posting-service.js";

export const invoiceRouter: Router = Router();
const uuid = z.uuid();
const minorString = z.string().regex(/^\d+$/).refine((value) => BigInt(value) <= 9_000_000_000_000_000n, "Amount is too large");
const actorId = (req: { header: (name: string) => string | undefined }) => {
  const parsed = uuid.safeParse(req.header("x-actor-id"));
  if (!parsed.success) throw new AppError("A valid actor ID is required", 400, [{ field: "x-actor-id", message: "Provide a valid UUID." }]);
  return parsed.data;
};
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
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

invoiceRouter.get("/supplier-invoices", async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(["DRAFT", "MATCHED", "EXCEPTION", "POSTED"]).optional(), vendorId: uuid.optional() }).parse(req.query);
  const conditions = [];
  if (query.status) conditions.push(eq(financialSupplierInvoices.status, query.status));
  if (query.vendorId) conditions.push(eq(financialSupplierInvoices.vendorId, query.vendorId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db.select().from(financialSupplierInvoices).where(where).orderBy(sql`${financialSupplierInvoices.createdAt} DESC`, sql`${financialSupplierInvoices.id} DESC`).limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: sql<number>`count(*)` }).from(financialSupplierInvoices).where(where),
  ]);
  const total = Number(row?.total ?? 0);
  return res.json({ data: data.map((invoice) => ({ ...invoice, totalMinor: invoice.totalMinor.toString(), taxMinor: invoice.taxMinor.toString() })), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
});
invoiceRouter.get("/supplier-invoices/:id", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const [invoice] = await db.select().from(financialSupplierInvoices).where(eq(financialSupplierInvoices.id, id)).limit(1);
  if (!invoice) throw new AppError("Supplier invoice not found", 404);
  const lines = await db.select().from(financialSupplierInvoiceLines).where(eq(financialSupplierInvoiceLines.invoiceId, id)).orderBy(financialSupplierInvoiceLines.lineNumber);
  return res.json({ data: { ...invoice, totalMinor: invoice.totalMinor.toString(), taxMinor: invoice.taxMinor.toString(), lines: lines.map((line) => ({ ...line, unitPriceMinor: line.unitPriceMinor.toString(), taxMinor: line.taxMinor.toString(), lineTotalMinor: line.lineTotalMinor.toString() })) } });
});
invoiceRouter.post("/supplier-invoices", async (req, res) => {
  const actor = actorId(req);
  const key = uuid.safeParse(req.header("idempotency-key"));
  if (!key.success) throw new AppError("An idempotency key is required", 400, [{ field: "Idempotency-Key", message: "Provide a UUID and reuse it for retries." }]);
  const input = bodySchema.parse(req.body);
  const normalized = { ...input, invoiceNumber: input.invoiceNumber.trim().toUpperCase() };
  const normalizedHash = hash(normalized);
  const lineTax = normalized.lines.reduce((sum, line) => sum + BigInt(line.taxMinor), 0n);
  const lineTotal = normalized.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n);
  for (const [index, line] of normalized.lines.entries()) {
    if (BigInt(line.lineTotalMinor) !== BigInt(line.unitPriceMinor) * BigInt(line.quantity) + BigInt(line.taxMinor)) throw new AppError("Invoice line total does not match quantity, price, and tax", 400, [{ field: `lines.${index}.lineTotalMinor`, message: "Use quantity × unit price + tax." }]);
  }
  if (lineTax !== BigInt(normalized.taxMinor) || lineTotal !== BigInt(normalized.totalMinor)) throw new AppError("Invoice totals do not match the line totals", 400, [{ field: "totalMinor", message: "Tax and invoice total must equal the sums of their lines." }]);
  const invoice = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key.data}))`);
    const [duplicate] = await tx.select().from(financialSupplierInvoices).where(eq(financialSupplierInvoices.idempotencyKey, key.data)).limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== normalizedHash) throw new AppError("Idempotency-Key was already used with different invoice data", 409);
      return duplicate;
    }
    const [saved] = await tx.insert(financialSupplierInvoices).values({ vendorId: normalized.vendorId, invoiceNumber: normalized.invoiceNumber, invoiceDate: normalized.invoiceDate, dueDate: normalized.dueDate ?? null, currency: normalized.currency, taxMinor: BigInt(normalized.taxMinor), totalMinor: BigInt(normalized.totalMinor), attachmentReference: normalized.attachmentReference ?? null, status: "DRAFT", idempotencyKey: key.data, requestHash: normalizedHash, createdBy: actor }).returning();
    if (!saved) throw new Error("Supplier invoice could not be saved");
    await tx.insert(financialSupplierInvoiceLines).values(normalized.lines.map((line, index) => ({ invoiceId: saved.id, lineNumber: index + 1, purchaseOrderId: line.purchaseOrderId, purchaseOrderLineId: line.purchaseOrderLineId, goodsReceiptId: line.goodsReceiptId, goodsReceiptLineId: line.goodsReceiptLineId, productId: line.productId, quantity: line.quantity, unitPriceMinor: BigInt(line.unitPriceMinor), taxMinor: BigInt(line.taxMinor), lineTotalMinor: BigInt(line.lineTotalMinor) })));
    await tx.insert(financialAuditLogs).values({ action: "SUPPLIER_INVOICE_CREATED", actorId: actor, recordType: "SUPPLIER_INVOICE", recordId: saved.id, details: { invoiceNumber: saved.invoiceNumber, vendorId: saved.vendorId, currency: saved.currency, totalMinor: saved.totalMinor.toString() } });
    return saved;
  });
  return res.status(201).json({ data: { ...invoice, totalMinor: invoice.totalMinor.toString(), taxMinor: invoice.taxMinor.toString() } });
});

invoiceRouter.post("/supplier-invoices/:id/match", async (req, res) => {
  const actor = actorId(req);
  const id = uuid.parse(req.params.id);
  const [invoice] = await db.select().from(financialSupplierInvoices).where(eq(financialSupplierInvoices.id, id)).limit(1);
  if (!invoice) throw new AppError("Supplier invoice not found", 404);
  if (invoice.status === "MATCHED" || invoice.status === "POSTED") return res.json({ data: { ...invoice, totalMinor: invoice.totalMinor.toString(), taxMinor: invoice.taxMinor.toString() } });
  if (invoice.status !== "DRAFT" && invoice.status !== "EXCEPTION") throw new AppError("This invoice cannot be matched in its current state", 409);
  const lines = await db.select().from(financialSupplierInvoiceLines).where(eq(financialSupplierInvoiceLines.invoiceId, id)).orderBy(financialSupplierInvoiceLines.lineNumber);
  const refs = new Map<string, { po: Awaited<ReturnType<typeof getPurchaseOrderForInvoice>>; receipt: Awaited<ReturnType<typeof getGoodsReceiptForInvoice>> }>();
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
  }
  const matched = await db.transaction(async (tx) => {
    const receiptLineIds = [...new Set(lines.map((line) => line.goodsReceiptLineId))].sort();
    for (const receiptLineId of receiptLineIds) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${receiptLineId}))`);
    for (const line of lines) {
      const existing = await tx.select({ quantity: financialSupplierInvoiceLines.quantity }).from(financialSupplierInvoiceLines).innerJoin(financialSupplierInvoices, eq(financialSupplierInvoices.id, financialSupplierInvoiceLines.invoiceId)).where(and(eq(financialSupplierInvoiceLines.goodsReceiptLineId, line.goodsReceiptLineId), inArray(financialSupplierInvoices.status, ["MATCHED", "POSTED"]), ne(financialSupplierInvoices.id, id)));
      const alreadyBilled = existing.reduce((sum, row) => sum + row.quantity, 0);
      const { receipt } = refs.get(`${line.purchaseOrderId}:${line.goodsReceiptId}`)!;
      const receiptLine = receipt.lines.find((item) => item.id === line.goodsReceiptLineId)!;
      if (alreadyBilled + line.quantity > receiptLine.quantityAccepted) throw new AppError("The accepted receipt quantity is already fully matched to other invoices", 409, [{ field: `lines.${line.lineNumber}.quantity`, message: "Reduce this invoice line quantity or resolve the existing invoice match." }]);
    }
    const [saved] = await tx.update(financialSupplierInvoices).set({ status: "MATCHED", exceptionReason: null }).where(eq(financialSupplierInvoices.id, id)).returning();
    if (!saved) throw new Error("Invoice match status was not saved");
    await tx.insert(financialAuditLogs).values({ action: "SUPPLIER_INVOICE_MATCHED", actorId: actor, recordType: "SUPPLIER_INVOICE", recordId: id, details: { lineCount: lines.length } });
    return saved;
  });
  return res.json({ data: { ...matched, totalMinor: matched.totalMinor.toString(), taxMinor: matched.taxMinor.toString() } });
});

invoiceRouter.post("/supplier-invoices/:id/approve", async (req, res) => {
  const actor = actorId(req);
  if (!env.postingEnabled) throw new AppError("Invoice posting is not enabled yet", 409, [{ field: "status", message: "Financial posting must be enabled after the chart and account mappings are approved." }]);
  const id = uuid.parse(req.params.id);
  const posted = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(financialSupplierInvoices).where(eq(financialSupplierInvoices.id, id)).for("update").limit(1);
    if (!invoice) throw new AppError("Supplier invoice not found", 404);
    if (invoice.status === "POSTED") return invoice;
    if (invoice.status !== "MATCHED") throw new AppError("Only a matched supplier invoice can be approved", 409);
    if (invoice.createdBy === actor) throw new AppError("The invoice creator cannot approve the same invoice", 403);
    const lines = await tx.select().from(financialSupplierInvoiceLines).where(eq(financialSupplierInvoiceLines.invoiceId, id)).orderBy(financialSupplierInvoiceLines.lineNumber);
    const receiptIds = [...new Set(lines.map((line) => line.goodsReceiptId))].sort();
    for (const receiptId of receiptIds) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${receiptId}))`);
    const byReceipt = new Map<string, bigint>();
    for (const line of lines) byReceipt.set(line.goodsReceiptId, (byReceipt.get(line.goodsReceiptId) ?? 0n) + (line.lineTotalMinor - line.taxMinor));
    const grni = await mappingAccount(tx, "GRNI", invoice.currency);
    for (const [receiptId, invoiceNet] of byReceipt) {
      const [postedReceipt] = await tx.select({ credit: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}),0)::text`, debit: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}),0)::text` }).from(financialJournalLines).innerJoin(financialJournals, eq(financialJournals.id, financialJournalLines.journalId)).where(and(eq(financialJournals.sourceType, "INVENTORY_VALUATION_CHANGED"), eq(financialJournals.sourceId, receiptId), eq(financialJournalLines.accountCode, grni.code)));
      const previouslyBilled = await tx.select({ net: sql<string>`coalesce(sum(${financialSupplierInvoiceLines.lineTotalMinor} - ${financialSupplierInvoiceLines.taxMinor}),0)::text` }).from(financialSupplierInvoiceLines).innerJoin(financialSupplierInvoices, eq(financialSupplierInvoices.id, financialSupplierInvoiceLines.invoiceId)).where(and(eq(financialSupplierInvoiceLines.goodsReceiptId, receiptId), eq(financialSupplierInvoices.status, "POSTED"), ne(financialSupplierInvoices.id, id)));
      const availableGrni = BigInt(postedReceipt?.credit ?? "0") - BigInt(postedReceipt?.debit ?? "0") - BigInt(previouslyBilled[0]?.net ?? "0");
      if (availableGrni < invoiceNet) throw new AppError("The receipt has not yet produced enough inventory accrual to post this invoice", 409, [{ field: "goodsReceiptId", message: "Wait for the verified receipt valuation to post, then retry approval." }]);
    }
    const [inputTax] = lines.length ? [await mappingAccount(tx, "INPUT_TAX", invoice.currency)] : [null];
    const invoiceNet = invoice.totalMinor - invoice.taxMinor;
    const journalLines = [];
    if (invoiceNet > 0n) journalLines.push({ accountCode: grni.code, debitMinor: invoiceNet, vendorId: invoice.vendorId, memo: `Matched goods for invoice ${invoice.invoiceNumber}` });
    if (invoice.taxMinor > 0n && inputTax) journalLines.push({ accountCode: inputTax.code, debitMinor: invoice.taxMinor, vendorId: invoice.vendorId, memo: `Input tax for invoice ${invoice.invoiceNumber}` });
    const ap = await mappingAccount(tx, "ACCOUNTS_PAYABLE", invoice.currency);
    journalLines.push({ accountCode: ap.code, creditMinor: invoice.totalMinor, vendorId: invoice.vendorId, memo: `Accounts payable ${invoice.invoiceNumber}` });
    const journal = await postJournal(tx, { sourceType: "SUPPLIER_INVOICE", sourceId: invoice.id, accountingDate: new Date(invoice.invoiceDate), currency: invoice.currency, description: `Supplier invoice ${invoice.invoiceNumber}`, actorId: actor, lines: journalLines });
    const [updated] = await tx.update(financialSupplierInvoices).set({ status: "POSTED", approvedBy: actor, approvedAt: new Date(), journalId: journal.id, exceptionReason: null }).where(eq(financialSupplierInvoices.id, invoice.id)).returning();
    if (!updated) throw new Error("Approved invoice could not be saved");
    await tx.insert(financialAuditLogs).values({ action: "SUPPLIER_INVOICE_APPROVED_AND_POSTED", actorId: actor, recordType: "SUPPLIER_INVOICE", recordId: invoice.id, details: { journalId: journal.id, invoiceNumber: invoice.invoiceNumber, totalMinor: invoice.totalMinor.toString() } });
    return updated;
  });
  return res.json({ data: { ...posted, totalMinor: posted.totalMinor.toString(), taxMinor: posted.taxMinor.toString() } });
});

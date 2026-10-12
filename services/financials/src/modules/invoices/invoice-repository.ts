import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  financialAuditLogs,
  financialJournalLines,
  financialJournals,
  financialSupplierInvoiceLines,
  financialSupplierInvoices,
} from "../../db/schema/financials.js";
import { AppError } from "../../errors/app-error.js";
import type { PostingOperations } from "../ledger/posting-contract.js";

export type SupplierInvoiceInput = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currency: "KES";
  taxMinor: string;
  totalMinor: string;
  attachmentReference?: string;
  lines: Array<{
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    goodsReceiptId: string;
    goodsReceiptLineId: string;
    productId: string;
    quantity: number;
    unitPriceMinor: string;
    taxMinor: string;
    lineTotalMinor: string;
  }>;
};

export const findSupplierInvoices = async (filters: {
  page: number;
  limit: number;
  status?: "DRAFT" | "MATCHED" | "EXCEPTION" | "POSTED";
  vendorId?: string;
}) => {
  const conditions = [];
  if (filters.status)
    conditions.push(eq(financialSupplierInvoices.status, filters.status));
  if (filters.vendorId)
    conditions.push(eq(financialSupplierInvoices.vendorId, filters.vendorId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, [row]] = await Promise.all([
    db
      .select()
      .from(financialSupplierInvoices)
      .where(where)
      .orderBy(
        sql`${financialSupplierInvoices.createdAt} DESC`,
        sql`${financialSupplierInvoices.id} DESC`,
      )
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit),
    db
      .select({ total: sql<number>`count(*)` })
      .from(financialSupplierInvoices)
      .where(where),
  ]);
  return { data, total: Number(row?.total ?? 0) };
};

export const findSupplierInvoiceById = async (id: string) => {
  const [invoice] = await db
    .select()
    .from(financialSupplierInvoices)
    .where(eq(financialSupplierInvoices.id, id))
    .limit(1);
  if (!invoice) return null;
  const lines = await db
    .select()
    .from(financialSupplierInvoiceLines)
    .where(eq(financialSupplierInvoiceLines.invoiceId, id))
    .orderBy(financialSupplierInvoiceLines.lineNumber);
  return { invoice, lines };
};

export const createSupplierInvoice = (
  input: SupplierInvoiceInput,
  actorId: string,
  idempotencyKey: string,
  requestHash: string,
) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`,
    );
    const [duplicate] = await tx
      .select()
      .from(financialSupplierInvoices)
      .where(eq(financialSupplierInvoices.idempotencyKey, idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== requestHash)
        throw new AppError(
          "Idempotency-Key was already used with different invoice data",
          409,
        );
      return duplicate;
    }
    const [saved] = await tx
      .insert(financialSupplierInvoices)
      .values({
        vendorId: input.vendorId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        currency: input.currency,
        taxMinor: BigInt(input.taxMinor),
        totalMinor: BigInt(input.totalMinor),
        attachmentReference: input.attachmentReference ?? null,
        status: "DRAFT",
        idempotencyKey,
        requestHash,
        createdBy: actorId,
      })
      .returning();
    if (!saved) throw new Error("Supplier invoice could not be saved");
    await tx
      .insert(financialSupplierInvoiceLines)
      .values(
        input.lines.map((line, index) => ({
          invoiceId: saved.id,
          lineNumber: index + 1,
          purchaseOrderId: line.purchaseOrderId,
          purchaseOrderLineId: line.purchaseOrderLineId,
          goodsReceiptId: line.goodsReceiptId,
          goodsReceiptLineId: line.goodsReceiptLineId,
          productId: line.productId,
          quantity: line.quantity,
          unitPriceMinor: BigInt(line.unitPriceMinor),
          taxMinor: BigInt(line.taxMinor),
          lineTotalMinor: BigInt(line.lineTotalMinor),
        })),
      );
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "SUPPLIER_INVOICE_CREATED",
        actorId,
        recordType: "SUPPLIER_INVOICE",
        recordId: saved.id,
        details: {
          invoiceNumber: saved.invoiceNumber,
          vendorId: saved.vendorId,
          currency: saved.currency,
          totalMinor: saved.totalMinor.toString(),
        },
      });
    return saved;
  });

export const matchSupplierInvoice = (
  id: string,
  actorId: string,
  lines: (typeof financialSupplierInvoiceLines.$inferSelect)[],
  acceptedQuantityByReceiptLineId: Map<string, number>,
) =>
  db.transaction(async (tx) => {
    const receiptLineIds = [
      ...new Set(lines.map((line) => line.goodsReceiptLineId)),
    ].sort();
    for (const receiptLineId of receiptLineIds)
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${receiptLineId}))`,
      );
    for (const line of lines) {
      const existing = await tx
        .select({ quantity: financialSupplierInvoiceLines.quantity })
        .from(financialSupplierInvoiceLines)
        .innerJoin(
          financialSupplierInvoices,
          eq(
            financialSupplierInvoices.id,
            financialSupplierInvoiceLines.invoiceId,
          ),
        )
        .where(
          and(
            eq(
              financialSupplierInvoiceLines.goodsReceiptLineId,
              line.goodsReceiptLineId,
            ),
            inArray(financialSupplierInvoices.status, ["MATCHED", "POSTED"]),
            ne(financialSupplierInvoices.id, id),
          ),
        );
      const alreadyBilled = existing.reduce(
        (sum, row) => sum + row.quantity,
        0,
      );
      const acceptedQuantity = acceptedQuantityByReceiptLineId.get(line.goodsReceiptLineId);
      if (acceptedQuantity === undefined || alreadyBilled + line.quantity > acceptedQuantity)
        throw new AppError(
          "The accepted receipt quantity is already fully matched to other invoices",
          409,
          [
            {
              field: `lines.${line.lineNumber}.quantity`,
              message:
                "Reduce this invoice line quantity or resolve the existing invoice match.",
            },
          ],
        );
    }
    const [saved] = await tx
      .update(financialSupplierInvoices)
      .set({ status: "MATCHED", exceptionReason: null })
      .where(eq(financialSupplierInvoices.id, id))
      .returning();
    if (!saved) throw new Error("Invoice match status was not saved");
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "SUPPLIER_INVOICE_MATCHED",
        actorId,
        recordType: "SUPPLIER_INVOICE",
        recordId: id,
        details: { lineCount: lines.length },
      });
    return saved;
  });

export const approveSupplierInvoice = (id: string, actorId: string, posting: PostingOperations) =>
  db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(financialSupplierInvoices)
      .where(eq(financialSupplierInvoices.id, id))
      .for("update")
      .limit(1);
    if (!invoice) throw new AppError("Supplier invoice not found", 404);
    if (invoice.status === "POSTED") return invoice;
    if (invoice.status !== "MATCHED")
      throw new AppError(
        "Only a matched supplier invoice can be approved",
        409,
      );
    if (invoice.createdBy === actorId)
      throw new AppError(
        "The invoice creator cannot approve the same invoice",
        403,
      );
    const lines = await tx
      .select()
      .from(financialSupplierInvoiceLines)
      .where(eq(financialSupplierInvoiceLines.invoiceId, id))
      .orderBy(financialSupplierInvoiceLines.lineNumber);
    const receiptIds = [
      ...new Set(lines.map((line) => line.goodsReceiptId)),
    ].sort();
    for (const receiptId of receiptIds)
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${receiptId}))`,
      );
    const byReceipt = new Map<string, bigint>();
    for (const line of lines)
      byReceipt.set(
        line.goodsReceiptId,
        (byReceipt.get(line.goodsReceiptId) ?? 0n) +
          (line.lineTotalMinor - line.taxMinor),
      );
    const grni = await posting.mappingAccount(tx, "GRNI", invoice.currency);
    for (const [receiptId, invoiceNet] of byReceipt) {
      const [postedReceipt] = await tx
        .select({
          credit: sql<string>`coalesce(sum(${financialJournalLines.creditMinor}),0)::text`,
          debit: sql<string>`coalesce(sum(${financialJournalLines.debitMinor}),0)::text`,
        })
        .from(financialJournalLines)
        .innerJoin(
          financialJournals,
          eq(financialJournals.id, financialJournalLines.journalId),
        )
        .where(
          and(
            eq(financialJournals.sourceType, "INVENTORY_VALUATION_CHANGED"),
            eq(financialJournals.sourceId, receiptId),
            eq(financialJournalLines.accountCode, grni.code),
          ),
        );
      const previouslyBilled = await tx
        .select({
          net: sql<string>`coalesce(sum(${financialSupplierInvoiceLines.lineTotalMinor} - ${financialSupplierInvoiceLines.taxMinor}),0)::text`,
        })
        .from(financialSupplierInvoiceLines)
        .innerJoin(
          financialSupplierInvoices,
          eq(
            financialSupplierInvoices.id,
            financialSupplierInvoiceLines.invoiceId,
          ),
        )
        .where(
          and(
            eq(financialSupplierInvoiceLines.goodsReceiptId, receiptId),
            eq(financialSupplierInvoices.status, "POSTED"),
            ne(financialSupplierInvoices.id, id),
          ),
        );
      const availableGrni =
        BigInt(postedReceipt?.credit ?? "0") -
        BigInt(postedReceipt?.debit ?? "0") -
        BigInt(previouslyBilled[0]?.net ?? "0");
      if (availableGrni < invoiceNet)
        throw new AppError(
          "The receipt has not yet produced enough inventory accrual to post this invoice",
          409,
          [
            {
              field: "goodsReceiptId",
              message:
                "Wait for the verified receipt valuation to post, then retry approval.",
            },
          ],
        );
    }
    const [inputTax] = lines.length
      ? [await posting.mappingAccount(tx, "INPUT_TAX", invoice.currency)]
      : [null];
    const invoiceNet = invoice.totalMinor - invoice.taxMinor;
    const journalLines = [];
    if (invoiceNet > 0n)
      journalLines.push({
        accountCode: grni.code,
        debitMinor: invoiceNet,
        vendorId: invoice.vendorId,
        memo: `Matched goods for invoice ${invoice.invoiceNumber}`,
      });
    if (invoice.taxMinor > 0n && inputTax)
      journalLines.push({
        accountCode: inputTax.code,
        debitMinor: invoice.taxMinor,
        vendorId: invoice.vendorId,
        memo: `Input tax for invoice ${invoice.invoiceNumber}`,
      });
    const ap = await posting.mappingAccount(tx, "ACCOUNTS_PAYABLE", invoice.currency);
    journalLines.push({
      accountCode: ap.code,
      creditMinor: invoice.totalMinor,
      vendorId: invoice.vendorId,
      memo: `Accounts payable ${invoice.invoiceNumber}`,
    });
    const journal = await posting.postJournal(tx, {
      sourceType: "SUPPLIER_INVOICE",
      sourceId: invoice.id,
      accountingDate: new Date(invoice.invoiceDate),
      currency: invoice.currency,
      description: `Supplier invoice ${invoice.invoiceNumber}`,
      actorId,
      lines: journalLines,
    });
    const [updated] = await tx
      .update(financialSupplierInvoices)
      .set({
        status: "POSTED",
        approvedBy: actorId,
        approvedAt: new Date(),
        journalId: journal.id,
        exceptionReason: null,
      })
      .where(eq(financialSupplierInvoices.id, invoice.id))
      .returning();
    if (!updated) throw new Error("Approved invoice could not be saved");
    await tx
      .insert(financialAuditLogs)
      .values({
        action: "SUPPLIER_INVOICE_APPROVED_AND_POSTED",
        actorId,
        recordType: "SUPPLIER_INVOICE",
        recordId: invoice.id,
        details: {
          journalId: journal.id,
          invoiceNumber: invoice.invoiceNumber,
          totalMinor: invoice.totalMinor.toString(),
        },
      });
    return updated;
  });

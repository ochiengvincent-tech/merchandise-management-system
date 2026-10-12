import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  retailAuditLogs,
  retailOutboxEvents,
  retailPrices,
  retailRegisters,
  retailReturnLines,
  retailReturns,
  retailReturnTenders,
  retailSaleLines,
  retailSales,
  retailTenders,
} from "../../db/schema/index.js";
import { AppError } from "../../errors/app-error.js";

export type CheckoutPlan = {
  registerId: string;
  locationId: string;
  warehouseManaged: boolean;
  actorId: string;
  lines: Array<{
    productId: string;
    reservationId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    taxRateBps: number;
    taxMinor: number;
    lineTotalMinor: number;
  }>;
  tenders: Array<{
    method: "CASH" | "CARD" | "GIFT_CARD";
    amountMinor: number;
    reference?: string;
  }>;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export const findActiveRegisters = () =>
  db
    .select()
    .from(retailRegisters)
    .where(eq(retailRegisters.active, "ACTIVE"))
    .orderBy(retailRegisters.name);

export const createRegister = (
  input: typeof retailRegisters.$inferInsert,
  actorId: string,
) =>
  db.transaction(async (tx) => {
    const [created] = await tx
      .insert(retailRegisters)
      .values(input)
      .returning();
    if (!created) throw new Error("Register was not created");
    await tx
      .insert(retailAuditLogs)
      .values({
        action: "REGISTER_CREATED",
        actorId,
        recordId: created.id,
        details: {
          code: created.code,
          locationId: created.inventoryLocationId,
        },
      });
    return created;
  });

export const findActiveRegisterById = (registerId: string) =>
  db
    .select()
    .from(retailRegisters)
    .where(
      and(
        eq(retailRegisters.id, registerId),
        eq(retailRegisters.active, "ACTIVE"),
      ),
    )
    .limit(1);

export const findRegisterById = (registerId: string) =>
  db
    .select()
    .from(retailRegisters)
    .where(eq(retailRegisters.id, registerId))
    .limit(1);

export const findCurrentPrice = (productId: string, now: Date) =>
  db
    .select()
    .from(retailPrices)
    .where(
      and(
        eq(retailPrices.productId, productId),
        lte(retailPrices.effectiveFrom, now),
        or(isNull(retailPrices.effectiveTo), gt(retailPrices.effectiveTo, now)),
      ),
    )
    .orderBy(desc(retailPrices.effectiveFrom))
    .limit(1);

export const saveRetailPrice = (
  productId: string,
  actorId: string,
  input: {
    amountMinor: number;
    taxRateBps: number;
    currency: "KES";
  },
  effectiveFrom: Date,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${productId}))`);
    const [active] = await tx
      .select()
      .from(retailPrices)
      .where(
        and(
          eq(retailPrices.productId, productId),
          lte(retailPrices.effectiveFrom, effectiveFrom),
          or(
            isNull(retailPrices.effectiveTo),
            gt(retailPrices.effectiveTo, effectiveFrom),
          ),
        ),
      )
      .orderBy(desc(retailPrices.effectiveFrom))
      .limit(1)
      .for("update");
    if (active && active.effectiveFrom >= effectiveFrom)
      throw new AppError(
        "Effective date must be later than the current price start",
        409,
        [
          {
            field: "effectiveFrom",
            message: "Choose a date after the existing price began.",
          },
        ],
      );
    const [future] = await tx
      .select()
      .from(retailPrices)
      .where(
        and(
          eq(retailPrices.productId, productId),
          gte(retailPrices.effectiveFrom, effectiveFrom),
        ),
      )
      .limit(1);
    if (future)
      throw new AppError("Retail price windows cannot overlap", 409, [
        {
          field: "effectiveFrom",
          message: "Choose a date before the next scheduled price.",
        },
      ]);
    if (active)
      await tx
        .update(retailPrices)
        .set({ effectiveTo: effectiveFrom })
        .where(eq(retailPrices.id, active.id));
    const [price] = await tx
      .insert(retailPrices)
      .values({
        productId,
        amountMinor: input.amountMinor,
        taxRateBps: input.taxRateBps,
        currency: input.currency,
        effectiveFrom,
        createdBy: actorId,
      })
      .returning();
    if (!price) throw new Error("Retail price was not created");
    await tx
      .insert(retailAuditLogs)
      .values({
        action: active ? "RETAIL_PRICE_CHANGED" : "RETAIL_PRICE_CREATED",
        actorId,
        recordId: price.id,
        details: {
          productId,
          ...(active
            ? {
                before: {
                  amountMinor: active.amountMinor,
                  taxRateBps: active.taxRateBps,
                },
              }
            : {}),
          after: {
            amountMinor: price.amountMinor,
            taxRateBps: price.taxRateBps,
          },
          effectiveFrom,
        },
      });
    return price;
  });

export const findSaleById = (saleId: string) =>
  db.select().from(retailSales).where(eq(retailSales.id, saleId)).limit(1);

export const findSaleByIdempotencyKey = (idempotencyKey: string) =>
  db
    .select()
    .from(retailSales)
    .where(eq(retailSales.idempotencyKey, idempotencyKey))
    .limit(1);

export const createPendingSale = async (
  data: typeof retailSales.$inferInsert,
  requestHash: string,
) => {
  try {
    const [sale] = await db.insert(retailSales).values(data).returning();
    return sale;
  } catch (error) {
    const [existing] = await findSaleByIdempotencyKey(data.idempotencyKey!);
    if (!existing) throw error;
    if (existing.requestHash !== requestHash)
      throw new AppError(
        "Idempotency-Key was already used with different checkout data",
        409,
      );
    return existing;
  }
};

export const markSaleFailed = (saleId: string, reason: string) =>
  db
    .update(retailSales)
    .set({ status: "FAILED", failureMessage: reason })
    .where(eq(retailSales.id, saleId));

export const completeSale = (
  sale: typeof retailSales.$inferSelect,
  plan: CheckoutPlan,
) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${plan.registerId}))`,
    );
    const [locked] = await tx
      .select()
      .from(retailSales)
      .where(eq(retailSales.id, sale.id))
      .for("update")
      .limit(1);
    if (!locked || locked.status === "COMPLETED") return;
    if (locked.status !== "PENDING")
      throw new AppError("Checkout is no longer pending", 409);
    for (const line of plan.lines)
      await tx
        .insert(retailSaleLines)
        .values({
          saleId: sale.id,
          productId: line.productId,
          reservationId: line.reservationId,
          skuSnapshot: line.sku,
          nameSnapshot: line.name,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          taxRateBps: line.taxRateBps,
          taxMinor: line.taxMinor,
          lineTotalMinor: line.lineTotalMinor,
        });
    const completedAt = new Date();
    const persistedTenders = [];
    for (const tender of plan.tenders) {
      const [saved] = await tx
        .insert(retailTenders)
        .values({
          saleId: sale.id,
          method: tender.method,
          amountMinor: tender.amountMinor,
          currency: "KES",
          reference: tender.reference ?? null,
        })
        .returning({
          id: retailTenders.id,
          method: retailTenders.method,
          amountMinor: retailTenders.amountMinor,
          status: retailTenders.status,
        });
      if (saved) persistedTenders.push(saved);
    }
    await tx
      .update(retailSales)
      .set({ status: "COMPLETED", completedAt })
      .where(eq(retailSales.id, sale.id));
    await tx
      .insert(retailAuditLogs)
      .values({
        action: "SALE_COMPLETED",
        actorId: plan.actorId,
        recordId: sale.id,
        details: {
          receiptNumber: sale.receiptNumber,
          registerId: plan.registerId,
          totalMinor: plan.totalMinor,
          lineCount: plan.lines.length,
        },
      });
    await tx
      .insert(retailOutboxEvents)
      .values({
        eventId: randomUUID(),
        eventType: "SaleCompleted",
        aggregateType: "Sale",
        aggregateId: sale.id,
        payload: {
          schemaVersion: 1,
          saleId: sale.id,
          receiptNumber: sale.receiptNumber,
          registerId: plan.registerId,
          actorId: plan.actorId,
          locationId: plan.locationId,
          warehouseManaged: plan.warehouseManaged,
          currency: "KES",
          completedAt: completedAt.toISOString(),
          totalMinor: plan.totalMinor,
          lines: plan.lines.map((line) => ({
            reservationId: line.reservationId,
            productId: line.productId,
            locationId: plan.locationId,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            taxMinor: line.taxMinor,
            lineTotalMinor: line.lineTotalMinor,
          })),
          tenders: persistedTenders.map(
            ({ id, method, amountMinor, status }) => ({
              id,
              method,
              amountMinor,
              outcome: status,
            }),
          ),
        },
      });
  });

export const findSaleDetails = async (saleId: string) => {
  const [lines, tenders] = await Promise.all([
    db.select().from(retailSaleLines).where(eq(retailSaleLines.saleId, saleId)),
    db.select().from(retailTenders).where(eq(retailTenders.saleId, saleId)),
  ]);
  const returns = lines.length
    ? await db
        .select({
          saleLineId: retailReturnLines.saleLineId,
          quantity: retailReturnLines.quantity,
          refundMinor: retailReturnLines.refundMinor,
        })
        .from(retailReturnLines)
        .innerJoin(
          retailReturns,
          eq(retailReturnLines.returnId, retailReturns.id),
        )
        .where(
          inArray(
            retailReturnLines.saleLineId,
            lines.map((line) => line.id),
          ),
        )
    : [];
  return { lines, tenders, returns };
};

export const findSaleLines = (saleId: string) =>
  db.select().from(retailSaleLines).where(eq(retailSaleLines.saleId, saleId));

export const findPriorReturnRows = (saleLineId: string) =>
  db
    .select({
      returnLine: retailReturnLines,
      createdAt: retailReturns.createdAt,
    })
    .from(retailReturnLines)
    .innerJoin(retailReturns, eq(retailReturnLines.returnId, retailReturns.id))
    .where(eq(retailReturnLines.saleLineId, saleLineId))
    .orderBy(retailReturns.createdAt);

export const findReturnByIdempotencyKey = (idempotencyKey: string) =>
  db
    .select()
    .from(retailReturns)
    .where(eq(retailReturns.idempotencyKey, idempotencyKey))
    .limit(1);

export const findReturnDetails = async (returnId: string) =>
  Promise.all([
    db
      .select()
      .from(retailReturnLines)
      .where(eq(retailReturnLines.returnId, returnId)),
    db
      .select()
      .from(retailReturnTenders)
      .where(eq(retailReturnTenders.returnId, returnId)),
  ]);

export const createSaleReturn = (input: {
  saleId: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  returnId: string;
  sale: typeof retailSales.$inferSelect;
  saleLines: (typeof retailSaleLines.$inferSelect)[];
  lines: Array<{
    saleLineId: string;
    quantity: number;
    disposition: "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN";
  }>;
  tenders: Array<{
    method: "CASH" | "CARD" | "GIFT_CARD";
    amountMinor: number;
    reference?: string;
  }>;
  reason: string;
}) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.saleId}))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.sale.registerId}))`,
    );
    const [duplicate] = await tx
      .select()
      .from(retailReturns)
      .where(eq(retailReturns.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== input.requestHash)
        throw new AppError(
          "Idempotency-Key was already used with different return data",
          409,
        );
      return duplicate;
    }
    const safeLines: Array<{
      saleLineId: string;
      productId: string;
      quantity: number;
      refundMinor: number;
      taxRefundMinor: number;
      disposition: string;
    }> = [];
    for (const requestLine of input.lines) {
      const line = input.saleLines.find(
        (item) => item.id === requestLine.saleLineId,
      );
      if (!line)
        throw new AppError("Return line does not belong to this sale", 400);
      const previousRows = await tx
        .select({ returnLine: retailReturnLines })
        .from(retailReturnLines)
        .innerJoin(
          retailReturns,
          eq(retailReturnLines.returnId, retailReturns.id),
        )
        .where(eq(retailReturnLines.saleLineId, line.id));
      const returnedQty = previousRows.reduce(
        (n, row) => n + row.returnLine.quantity,
        0,
      );
      const refunded = previousRows.reduce(
        (n, row) => n + row.returnLine.refundMinor,
        0,
      );
      if (returnedQty + requestLine.quantity > line.quantity)
        throw new AppError(
          "Return quantity exceeds the remaining sale quantity",
          409,
          [
            {
              field: "lines",
              message: `${line.nameSnapshot} has ${line.quantity - returnedQty} unit(s) remaining for return.`,
            },
          ],
        );
      safeLines.push({
        saleLineId: line.id,
        productId: line.productId,
        quantity: requestLine.quantity,
        refundMinor:
          Math.round(
            (line.lineTotalMinor * (returnedQty + requestLine.quantity)) /
              line.quantity,
          ) - refunded,
        taxRefundMinor:
          Math.round(
            (line.taxMinor * (returnedQty + requestLine.quantity)) /
              line.quantity,
          ) - Math.round((line.taxMinor * returnedQty) / line.quantity),
        disposition: requestLine.disposition,
      });
    }
    const safeTotal = safeLines.reduce(
      (sum, line) => sum + line.refundMinor,
      0,
    );
    if (
      input.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0) !==
      safeTotal
    )
      throw new AppError(
        "Refund tender amounts changed because earlier returns were recorded",
        409,
        [
          {
            field: "tenders",
            message: `Retry with the current refund amount KES ${(safeTotal / 100).toFixed(2)}.`,
          },
        ],
      );
    const [created] = await tx
      .insert(retailReturns)
      .values({
        id: input.returnId,
        returnNumber: `RET-${input.returnId.slice(0, 12).toUpperCase()}`,
        saleId: input.saleId,
        actorId: input.actorId,
        reason: input.reason,
        totalRefundMinor: safeTotal,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      })
      .returning();
    if (!created) throw new Error("Return was not persisted");
    for (const line of safeLines)
      await tx
        .insert(retailReturnLines)
        .values({ returnId: input.returnId, ...line });
    const persistedRefundTenders = [];
    for (const tender of input.tenders) {
      const [saved] = await tx
        .insert(retailReturnTenders)
        .values({
          returnId: input.returnId,
          method: tender.method,
          amountMinor: tender.amountMinor,
          reference: tender.reference ?? null,
        })
        .returning({
          id: retailReturnTenders.id,
          method: retailReturnTenders.method,
          amountMinor: retailReturnTenders.amountMinor,
          status: retailReturnTenders.status,
        });
      if (saved) persistedRefundTenders.push(saved);
    }
    await tx
      .insert(retailAuditLogs)
      .values({
        action: "RETURN_RECORDED",
        actorId: input.actorId,
        recordId: input.returnId,
        details: {
          saleId: input.saleId,
          returnNumber: created.returnNumber,
          totalRefundMinor: safeTotal,
          reason: input.reason,
        },
      });
    await tx
      .insert(retailOutboxEvents)
      .values({
        eventId: randomUUID(),
        eventType: "SaleReturned",
        aggregateType: "Sale",
        aggregateId: input.saleId,
        payload: {
          schemaVersion: 1,
          returnId: input.returnId,
          saleId: input.saleId,
          receiptNumber: input.sale.receiptNumber,
          registerId: input.sale.registerId,
          actorId: input.actorId,
          locationId: input.sale.inventoryLocationId,
          warehouseManaged: input.sale.warehouseManaged,
          currency: input.sale.currency,
          returnedAt: created.createdAt.toISOString(),
          totalRefundMinor: safeTotal,
          tenders: persistedRefundTenders.map(
            ({ id, method, amountMinor, status }) => ({
              id,
              method,
              amountMinor,
              outcome: status,
            }),
          ),
          lines: safeLines,
        },
      });
    return created;
  });

export const findCompletedSales = (
  search: string | undefined,
  limit: number,
) => {
  const where = search
    ? and(
        eq(retailSales.status, "COMPLETED"),
        ilike(retailSales.receiptNumber, `%${search}%`),
      )
    : eq(retailSales.status, "COMPLETED");
  return db
    .select()
    .from(retailSales)
    .where(where)
    .orderBy(desc(retailSales.completedAt))
    .limit(limit);
};

export const findRegisterSalesTotals = (query: {
  registerId: string;
  from: Date;
  to: Date;
}) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${query.registerId}))`,
    );
    const snapshotAt = new Date();
    const sales = await tx
      .select({ id: retailSales.id })
      .from(retailSales)
      .where(
        and(
          eq(retailSales.registerId, query.registerId),
          eq(retailSales.status, "COMPLETED"),
          gte(retailSales.completedAt, query.from),
          lt(retailSales.completedAt, query.to),
        ),
      );
    const saleTenders = sales.length
      ? await tx
          .select({
            method: retailTenders.method,
            amountMinor: retailTenders.amountMinor,
          })
          .from(retailTenders)
          .where(
            and(
              inArray(
                retailTenders.saleId,
                sales.map((sale) => sale.id),
              ),
              eq(retailTenders.status, "RECORDED"),
            ),
          )
      : [];
    const returns = await tx
      .select({ id: retailReturns.id })
      .from(retailReturns)
      .innerJoin(retailSales, eq(retailReturns.saleId, retailSales.id))
      .where(
        and(
          eq(retailSales.registerId, query.registerId),
          gte(retailReturns.createdAt, query.from),
          lt(retailReturns.createdAt, query.to),
          eq(retailReturns.status, "RECORDED"),
        ),
      );
    const refundTenders = returns.length
      ? await tx
          .select({
            method: retailReturnTenders.method,
            amountMinor: retailReturnTenders.amountMinor,
          })
          .from(retailReturnTenders)
          .where(
            and(
              inArray(
                retailReturnTenders.returnId,
                returns.map((item) => item.id),
              ),
              eq(retailReturnTenders.status, "RECORDED"),
            ),
          )
      : [];
    return { snapshotAt, sales, saleTenders, returns, refundTenders };
  });

import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { retailAuditLogs, retailOutboxEvents, retailPrices, retailRegisters, retailReturnLines, retailReturns, retailReturnTenders, retailSaleLines, retailSales, retailTenders } from "../../db/schema/index.js";
import { AppError } from "../../errors/app-error.js";
import { inventoryLocation, inventoryProduct, inventoryStockAtLocation, reserveInventoryStock, releaseInventoryStock, searchInventoryProducts } from "./inventory-client.js";

export const retailSalesRouter: Router = Router();
const uuid = z.uuid();
const actorFrom = (value: string | undefined) => {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AppError("A valid x-actor-id header is required", 400, [{ field: "x-actor-id", message: "Provide the current employee UUID." }]);
  return parsed.data;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tenderSchema = z.object({ method: z.enum(["CASH", "CARD", "GIFT_CARD"]), amountMinor: z.number().int().positive().max(2147483647), reference: z.string().trim().max(150).optional() });
const checkoutSchema = z.object({ registerId: uuid, lines: z.array(z.object({ productId: uuid, quantity: z.number().int().positive().max(100000) })).min(1).max(100), tenders: z.array(tenderSchema).min(1) }).superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.lines.forEach((line, i) => { if (seen.has(line.productId)) ctx.addIssue({ code: "custom", path: ["lines", i, "productId"], message: "Add each product once and adjust its quantity." }); seen.add(line.productId); });
});
type PlanLine = { productId: string; reservationId: string; sku: string; name: string; quantity: number; unitPriceMinor: number; taxRateBps: number; taxMinor: number; lineTotalMinor: number };
type ReservationPlan = { registerId: string; locationId: string; warehouseManaged: boolean; actorId: string; lines: PlanLine[]; tenders: Array<z.infer<typeof tenderSchema>>; subtotalMinor: number; taxMinor: number; totalMinor: number };

async function attachSaleDetails(sale: typeof retailSales.$inferSelect) {
  const [lines, tenders] = await Promise.all([
    db.select().from(retailSaleLines).where(eq(retailSaleLines.saleId, sale.id)),
    db.select().from(retailTenders).where(eq(retailTenders.saleId, sale.id)),
  ]);
  const returns = lines.length ? await db.select({ saleLineId: retailReturnLines.saleLineId, quantity: retailReturnLines.quantity, refundMinor: retailReturnLines.refundMinor }).from(retailReturnLines).innerJoin(retailReturns, eq(retailReturnLines.returnId, retailReturns.id)).where(inArray(retailReturnLines.saleLineId, lines.map((line) => line.id))) : [];
  const returnState = new Map<string, { quantity: number; refundMinor: number }>();
  for (const item of returns) {
    const current = returnState.get(item.saleLineId) ?? { quantity: 0, refundMinor: 0 };
    current.quantity += item.quantity; current.refundMinor += item.refundMinor; returnState.set(item.saleLineId, current);
  }
  return { ...sale, lines: lines.map((line) => ({ ...line, returnedQuantity: returnState.get(line.id)?.quantity ?? 0, refundedMinor: returnState.get(line.id)?.refundMinor ?? 0 })), tenders };
}
async function getSale(saleId: string) {
  const [sale] = await db.select().from(retailSales).where(eq(retailSales.id, saleId)).limit(1);
  if (!sale) throw new AppError("Sale not found", 404);
  return attachSaleDetails(sale);
}

retailSalesRouter.get("/registers", async (_req, res) => {
  const data = await db.select().from(retailRegisters).where(eq(retailRegisters.active, "ACTIVE")).orderBy(retailRegisters.name);
  return res.json({ data });
});
retailSalesRouter.post("/registers", async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const input = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), inventoryLocationId: uuid }).parse(req.body);
  const location = await inventoryLocation(input.inventoryLocationId);
  if (location.status !== "ACTIVE" || location.locationType !== "STORE") throw new AppError("Register must belong to an active store location", 400, [{ field: "inventoryLocationId", message: "Choose an active Inventory location of type Store." }]);
  const register = await db.transaction(async (tx) => {
    const [created] = await tx.insert(retailRegisters).values(input).returning();
    if (!created) throw new Error("Register was not created");
    await tx.insert(retailAuditLogs).values({ action: "REGISTER_CREATED", actorId, recordId: created.id, details: { code: created.code, locationId: created.inventoryLocationId } });
    return created;
  });
  return res.status(201).json({ data: register });
});

retailSalesRouter.get("/products/search", async (req, res) => {
  const { q, registerId } = z.object({ q: z.string().trim().min(1).max(100), registerId: uuid.optional() }).parse(req.query);
  const products = await searchInventoryProducts(q);
  if (!registerId) return res.json({ data: products.map((product) => ({ ...product, quantityAvailable: null })) });
  const [register] = await db.select().from(retailRegisters).where(and(eq(retailRegisters.id, registerId), eq(retailRegisters.active, "ACTIVE"))).limit(1);
  if (!register) throw new AppError("Active register not found", 404);
  const stock = await inventoryStockAtLocation(register.inventoryLocationId);
  const quantityByProduct = new Map(stock.map((item) => [item.productId, item.quantityAvailable]));
  return res.json({ data: products.map((product) => ({ ...product, quantityAvailable: quantityByProduct.get(product.id) ?? 0 })) });
});
retailSalesRouter.get("/prices", async (req, res) => {
  const { productId } = z.object({ productId: uuid }).parse(req.query);
  const now = new Date();
  const [price] = await db.select().from(retailPrices).where(and(eq(retailPrices.productId, productId), lte(retailPrices.effectiveFrom, now), or(isNull(retailPrices.effectiveTo), gt(retailPrices.effectiveTo, now)))).orderBy(desc(retailPrices.effectiveFrom)).limit(1);
  return res.json({ data: price ?? null });
});
retailSalesRouter.put("/prices/:productId", async (req, res) => {
  const productId = uuid.parse(req.params.productId);
  const actorId = actorFrom(req.header("x-actor-id"));
  const input = z.object({ amountMinor: z.number().int().nonnegative().max(2147483647), taxRateBps: z.number().int().min(0).max(10000).default(0), currency: z.literal("KES").default("KES"), effectiveFrom: z.iso.datetime().optional() }).parse(req.body);
  const product = await inventoryProduct(productId);
  if (product.status !== "ACTIVE") throw new AppError("Inactive products cannot be priced for sale", 409);
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${productId}))`);
    const [active] = await tx.select().from(retailPrices).where(and(eq(retailPrices.productId, productId), lte(retailPrices.effectiveFrom, effectiveFrom), or(isNull(retailPrices.effectiveTo), gt(retailPrices.effectiveTo, effectiveFrom)))).orderBy(desc(retailPrices.effectiveFrom)).limit(1).for("update");
    if (active && active.effectiveFrom >= effectiveFrom) throw new AppError("Effective date must be later than the current price start", 409, [{ field: "effectiveFrom", message: "Choose a date after the existing price began." }]);
    const [future] = await tx.select().from(retailPrices).where(and(eq(retailPrices.productId, productId), gte(retailPrices.effectiveFrom, effectiveFrom))).limit(1);
    if (future) throw new AppError("Retail price windows cannot overlap", 409, [{ field: "effectiveFrom", message: "Choose a date before the next scheduled price." }]);
    if (active) await tx.update(retailPrices).set({ effectiveTo: effectiveFrom }).where(eq(retailPrices.id, active.id));
    const [price] = await tx.insert(retailPrices).values({ productId, amountMinor: input.amountMinor, taxRateBps: input.taxRateBps, currency: input.currency, effectiveFrom, createdBy: actorId }).returning();
    if (!price) throw new Error("Retail price was not created");
    await tx.insert(retailAuditLogs).values({ action: active ? "RETAIL_PRICE_CHANGED" : "RETAIL_PRICE_CREATED", actorId, recordId: price.id, details: { productId, ...(active ? { before: { amountMinor: active.amountMinor, taxRateBps: active.taxRateBps } } : {}), after: { amountMinor: price.amountMinor, taxRateBps: price.taxRateBps }, effectiveFrom } });
    return price;
  });
  return res.status(201).json({ data: result });
});

retailSalesRouter.post("/sales", async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = uuid.safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Use the same unique UUID when retrying this checkout." }]);
  const input = checkoutSchema.parse(req.body);
  const requestHash = hash({ actorId, ...input });
  let [sale] = await db.select().from(retailSales).where(eq(retailSales.idempotencyKey, idempotencyKey.data)).limit(1);
  if (sale && sale.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different checkout data", 409);

  if (!sale) {
    const [register] = await db.select().from(retailRegisters).where(and(eq(retailRegisters.id, input.registerId), eq(retailRegisters.active, "ACTIVE"))).limit(1);
    if (!register) throw new AppError("Active register not found", 404);
    const location = await inventoryLocation(register.inventoryLocationId);
    if (location.status !== "ACTIVE" || location.locationType !== "STORE") throw new AppError("Register's Inventory location is unavailable", 409);
    const lines: PlanLine[] = [];
    for (const line of input.lines) {
      const product = await inventoryProduct(line.productId);
      if (product.status !== "ACTIVE") throw new AppError("Inactive products cannot be sold", 409, [{ field: "lines", message: `${product.sku} is inactive.` }]);
      const now = new Date();
      const [price] = await db.select().from(retailPrices).where(and(eq(retailPrices.productId, line.productId), lte(retailPrices.effectiveFrom, now), or(isNull(retailPrices.effectiveTo), gt(retailPrices.effectiveTo, now)))).orderBy(desc(retailPrices.effectiveFrom)).limit(1);
      if (!price) throw new AppError("A current retail price is required for every item", 400, [{ field: "lines", message: `Set a retail price for ${product.name} before checkout.` }]);
      const base = price.amountMinor * line.quantity;
      if (!Number.isSafeInteger(base) || base > 2147483647) throw new AppError("Line total exceeds the supported amount", 400, [{ field: "lines", message: `${product.name} total is too large for one sale line.` }]);
      const taxMinor = Math.round(base * price.taxRateBps / 10000);
      lines.push({ productId: product.id, reservationId: randomUUID(), sku: product.sku, name: product.name, quantity: line.quantity, unitPriceMinor: price.amountMinor, taxRateBps: price.taxRateBps, taxMinor, lineTotalMinor: base + taxMinor });
    }
    const subtotalMinor = lines.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0);
    const taxMinor = lines.reduce((total, line) => total + line.taxMinor, 0);
    const totalMinor = subtotalMinor + taxMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor > 2147483647) throw new AppError("Sale total exceeds the supported amount", 400);
    const tenderTotal = input.tenders.reduce((total, tender) => total + tender.amountMinor, 0);
    if (tenderTotal !== totalMinor) throw new AppError("Tender amounts must match the amount due", 400, [{ field: "tenders", message: `Amount due is KES ${(totalMinor / 100).toFixed(2)}; tendered KES ${(tenderTotal / 100).toFixed(2)}.` }]);
    const plan: ReservationPlan = { registerId: register.id, locationId: location.id, warehouseManaged: location.warehouseManaged, actorId, lines, tenders: input.tenders, subtotalMinor, taxMinor, totalMinor };
    const saleId = randomUUID();
    const now = new Date();
    try {
      [sale] = await db.insert(retailSales).values({ id: saleId, receiptNumber: `POS-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${saleId.slice(0, 8).toUpperCase()}`, registerId: register.id, inventoryLocationId: location.id, warehouseManaged: location.warehouseManaged, actorId, status: "PENDING", currency: "KES", subtotalMinor, taxMinor, totalMinor, idempotencyKey: idempotencyKey.data, requestHash, reservationPlan: plan }).returning();
    } catch (error) {
      const [existing] = await db.select().from(retailSales).where(eq(retailSales.idempotencyKey, idempotencyKey.data)).limit(1);
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different checkout data", 409);
      sale = existing;
    }
  }
  if (!sale) throw new Error("Checkout could not be started");
  if (sale.status === "COMPLETED") return res.status(200).json({ data: await getSale(sale.id) });
  if (sale.status === "FAILED") throw new AppError(sale.failureMessage ?? "This checkout attempt failed", 409);
  const plan = sale.reservationPlan as ReservationPlan;
  try {
    for (const line of plan.lines) {
      await reserveInventoryStock({ reservationId: line.reservationId, saleId: sale.id, productId: line.productId, locationId: plan.locationId, quantity: line.quantity, actorId: plan.actorId });
    }
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 503) throw new AppError("Checkout is pending Inventory confirmation. Retry with the same Idempotency-Key; do not start a second checkout.", 503);
    const releases = await Promise.allSettled(plan.lines.map((line) => releaseInventoryStock(line.reservationId, plan.actorId)));
    if (releases.some((result) => result.status === "rejected")) {
      throw new AppError("Checkout is pending Inventory reservation cleanup. Retry with the same Idempotency-Key.", 503);
    }
    const reason = error instanceof Error ? error.message : "Inventory rejected the reservation";
    await db.update(retailSales).set({ status: "FAILED", failureMessage: reason }).where(eq(retailSales.id, sale.id));
    throw error;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${plan.registerId}))`);
    const [locked] = await tx.select().from(retailSales).where(eq(retailSales.id, sale.id)).for("update").limit(1);
    if (!locked || locked.status === "COMPLETED") return;
    if (locked.status !== "PENDING") throw new AppError("Checkout is no longer pending", 409);
    for (const line of plan.lines) await tx.insert(retailSaleLines).values({ saleId: sale.id, productId: line.productId, reservationId: line.reservationId, skuSnapshot: line.sku, nameSnapshot: line.name, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, taxRateBps: line.taxRateBps, taxMinor: line.taxMinor, lineTotalMinor: line.lineTotalMinor });
    const completedAt = new Date();
    const persistedTenders = [];
    for (const tender of plan.tenders) {
      const [saved] = await tx.insert(retailTenders).values({ saleId: sale.id, method: tender.method, amountMinor: tender.amountMinor, currency: "KES", reference: tender.reference ?? null }).returning({ id: retailTenders.id, method: retailTenders.method, amountMinor: retailTenders.amountMinor, status: retailTenders.status });
      if (saved) persistedTenders.push(saved);
    }
    await tx.update(retailSales).set({ status: "COMPLETED", completedAt }).where(eq(retailSales.id, sale.id));
    await tx.insert(retailAuditLogs).values({ action: "SALE_COMPLETED", actorId: plan.actorId, recordId: sale.id, details: { receiptNumber: sale.receiptNumber, registerId: plan.registerId, totalMinor: plan.totalMinor, lineCount: plan.lines.length } });
    await tx.insert(retailOutboxEvents).values({ eventId: randomUUID(), eventType: "SaleCompleted", aggregateType: "Sale", aggregateId: sale.id, payload: { schemaVersion: 1, saleId: sale.id, receiptNumber: sale.receiptNumber, registerId: plan.registerId, actorId: plan.actorId, locationId: plan.locationId, warehouseManaged: plan.warehouseManaged, currency: "KES", completedAt: completedAt.toISOString(), totalMinor: plan.totalMinor, lines: plan.lines.map((line) => ({ reservationId: line.reservationId, productId: line.productId, locationId: plan.locationId, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, taxMinor: line.taxMinor, lineTotalMinor: line.lineTotalMinor })), tenders: persistedTenders.map(({ id, method, amountMinor, status }) => ({ id, method, amountMinor, outcome: status })) } });
  });
  return res.status(201).json({ data: await getSale(sale.id) });
});

retailSalesRouter.get("/sales-audit/register-totals", async (req, res) => {
  const query = z.object({ registerId: uuid, from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
  if (query.from >= query.to) throw new AppError("Invalid reconciliation interval", 400, [{ field: "to", message: "Choose an end time later than the start time." }]);
  const [register] = await db.select().from(retailRegisters).where(eq(retailRegisters.id, query.registerId)).limit(1);
  if (!register) throw new AppError("Register not found", 404);
  const data = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${query.registerId}))`);
    const snapshotAt = new Date();
    const sales = await tx.select({ id: retailSales.id }).from(retailSales).where(and(eq(retailSales.registerId, query.registerId), eq(retailSales.status, "COMPLETED"), gte(retailSales.completedAt, query.from), lt(retailSales.completedAt, query.to)));
    const saleTenders = sales.length ? await tx.select({ method: retailTenders.method, amountMinor: retailTenders.amountMinor }).from(retailTenders).where(and(inArray(retailTenders.saleId, sales.map((sale) => sale.id)), eq(retailTenders.status, "RECORDED"))) : [];
    const returns = await tx.select({ id: retailReturns.id }).from(retailReturns).innerJoin(retailSales, eq(retailReturns.saleId, retailSales.id)).where(and(eq(retailSales.registerId, query.registerId), gte(retailReturns.createdAt, query.from), lt(retailReturns.createdAt, query.to), eq(retailReturns.status, "RECORDED")));
    const refundTenders = returns.length ? await tx.select({ method: retailReturnTenders.method, amountMinor: retailReturnTenders.amountMinor }).from(retailReturnTenders).where(and(inArray(retailReturnTenders.returnId, returns.map((item) => item.id)), eq(retailReturnTenders.status, "RECORDED"))) : [];
    const tenderTotals: Record<string, { saleMinor: number; refundMinor: number }> = { CASH: { saleMinor: 0, refundMinor: 0 }, CARD: { saleMinor: 0, refundMinor: 0 }, GIFT_CARD: { saleMinor: 0, refundMinor: 0 } };
    for (const tender of saleTenders) tenderTotals[tender.method]!.saleMinor += tender.amountMinor;
    for (const tender of refundTenders) tenderTotals[tender.method]!.refundMinor += tender.amountMinor;
    return { registerId: query.registerId, from: query.from.toISOString(), to: query.to.toISOString(), currency: "KES", snapshotAt: snapshotAt.toISOString(), saleCount: sales.length, returnCount: returns.length, tenderTotals };
  });
  return res.json({ data });
});

retailSalesRouter.get("/sales", async (req, res) => {
  const filter = z.object({ search: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
  const where = filter.search ? and(eq(retailSales.status, "COMPLETED"), ilike(retailSales.receiptNumber, `%${filter.search}%`)) : eq(retailSales.status, "COMPLETED");
  const rows = await db.select().from(retailSales).where(where).orderBy(desc(retailSales.completedAt)).limit(filter.limit);
  const data = await Promise.all(rows.map((row) => attachSaleDetails(row)));
  return res.json({ data });
});
retailSalesRouter.post("/sales/:id/returns", async (req, res) => {
  const saleId = uuid.parse(req.params.id);
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = uuid.safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this return." }]);
  const input = z.object({
    reason: z.string().trim().min(1).max(255),
    lines: z.array(z.object({ saleLineId: uuid, quantity: z.number().int().positive(), disposition: z.enum(["RESTOCK_SELLABLE", "QUARANTINE", "NO_STOCK_RETURN"]) })).min(1),
    tenders: z.array(tenderSchema).min(1),
  }).superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.lines.forEach((line, index) => { if (ids.has(line.saleLineId)) ctx.addIssue({ code: "custom", path: ["lines", index, "saleLineId"], message: "Each sale line can only appear once." }); ids.add(line.saleLineId); });
  }).parse(req.body);
  const requestHash = hash({ saleId, actorId, ...input });
  const [prior] = await db.select().from(retailReturns).where(eq(retailReturns.idempotencyKey, idempotencyKey.data)).limit(1);
  if (prior) {
    if (prior.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different return data", 409);
    const [lines, tenders] = await Promise.all([db.select().from(retailReturnLines).where(eq(retailReturnLines.returnId, prior.id)), db.select().from(retailReturnTenders).where(eq(retailReturnTenders.returnId, prior.id))]);
    return res.status(200).json({ data: { ...prior, lines, tenders } });
  }
  const [sale] = await db.select().from(retailSales).where(eq(retailSales.id, saleId)).limit(1);
  if (!sale || sale.status !== "COMPLETED") throw new AppError("Only a completed sale can be returned", 409);
  const saleLines = await db.select().from(retailSaleLines).where(eq(retailSaleLines.saleId, saleId));
  const prepared: Array<{ saleLineId: string; productId: string; quantity: number; refundMinor: number; taxRefundMinor: number; disposition: string }> = [];
  for (const requestLine of input.lines) {
    const line = saleLines.find((item) => item.id === requestLine.saleLineId);
    if (!line) throw new AppError("Return line does not belong to this sale", 400, [{ field: "lines", message: "Select an item from this receipt." }]);
    const previousRows = await db.select({ returnLine: retailReturnLines, createdAt: retailReturns.createdAt }).from(retailReturnLines).innerJoin(retailReturns, eq(retailReturnLines.returnId, retailReturns.id)).where(eq(retailReturnLines.saleLineId, line.id)).orderBy(asc(retailReturns.createdAt));
    const returnedQty = previousRows.reduce((n, row) => n + row.returnLine.quantity, 0);
    const refunded = previousRows.reduce((n, row) => n + row.returnLine.refundMinor, 0);
    if (returnedQty + requestLine.quantity > line.quantity) throw new AppError("Return quantity exceeds the remaining sale quantity", 409, [{ field: "lines", message: `${line.nameSnapshot} has ${line.quantity - returnedQty} unit(s) remaining for return.` }]);
    const lineRefund = Math.round(line.lineTotalMinor * (returnedQty + requestLine.quantity) / line.quantity) - refunded;
    prepared.push({ saleLineId: line.id, productId: line.productId, quantity: requestLine.quantity, refundMinor: lineRefund, taxRefundMinor: Math.round(line.taxMinor * (returnedQty + requestLine.quantity) / line.quantity) - Math.round(line.taxMinor * returnedQty / line.quantity), disposition: requestLine.disposition });
  }
  const totalRefundMinor = prepared.reduce((sum, line) => sum + line.refundMinor, 0);
  const tenderTotal = input.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0);
  if (tenderTotal !== totalRefundMinor) throw new AppError("Refund tender amounts must match the return total", 400, [{ field: "tenders", message: `Refund amount is KES ${(totalRefundMinor / 100).toFixed(2)}.` }]);
  const returnId = randomUUID();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey.data}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${saleId}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sale.registerId}))`);
    const [duplicate] = await tx.select().from(retailReturns).where(eq(retailReturns.idempotencyKey, idempotencyKey.data)).limit(1);
    if (duplicate) {
      if (duplicate.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different return data", 409);
      return duplicate;
    }
    const safeLines: typeof prepared = [];
    for (const requestLine of input.lines) {
      const line = saleLines.find((item) => item.id === requestLine.saleLineId);
      if (!line) throw new AppError("Return line does not belong to this sale", 400);
      const previousRows = await tx.select({ returnLine: retailReturnLines }).from(retailReturnLines).innerJoin(retailReturns, eq(retailReturnLines.returnId, retailReturns.id)).where(eq(retailReturnLines.saleLineId, line.id));
      const returnedQty = previousRows.reduce((n, row) => n + row.returnLine.quantity, 0);
      const refunded = previousRows.reduce((n, row) => n + row.returnLine.refundMinor, 0);
      if (returnedQty + requestLine.quantity > line.quantity) throw new AppError("Return quantity exceeds the remaining sale quantity", 409, [{ field: "lines", message: `${line.nameSnapshot} has ${line.quantity - returnedQty} unit(s) remaining for return.` }]);
      safeLines.push({ saleLineId: line.id, productId: line.productId, quantity: requestLine.quantity, refundMinor: Math.round(line.lineTotalMinor * (returnedQty + requestLine.quantity) / line.quantity) - refunded, taxRefundMinor: Math.round(line.taxMinor * (returnedQty + requestLine.quantity) / line.quantity) - Math.round(line.taxMinor * returnedQty / line.quantity), disposition: requestLine.disposition });
    }
    const safeTotal = safeLines.reduce((sum, line) => sum + line.refundMinor, 0);
    if (input.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0) !== safeTotal) throw new AppError("Refund tender amounts changed because earlier returns were recorded", 409, [{ field: "tenders", message: `Retry with the current refund amount KES ${(safeTotal / 100).toFixed(2)}.` }]);
    const [created] = await tx.insert(retailReturns).values({ id: returnId, returnNumber: `RET-${returnId.slice(0, 12).toUpperCase()}`, saleId, actorId, reason: input.reason, totalRefundMinor: safeTotal, idempotencyKey: idempotencyKey.data, requestHash }).returning();
    if (!created) throw new Error("Return was not persisted");
    for (const line of safeLines) await tx.insert(retailReturnLines).values({ returnId, ...line });
    const persistedRefundTenders = [];
    for (const tender of input.tenders) {
      const [saved] = await tx.insert(retailReturnTenders).values({ returnId, method: tender.method, amountMinor: tender.amountMinor, reference: tender.reference ?? null }).returning({ id: retailReturnTenders.id, method: retailReturnTenders.method, amountMinor: retailReturnTenders.amountMinor, status: retailReturnTenders.status });
      if (saved) persistedRefundTenders.push(saved);
    }
    await tx.insert(retailAuditLogs).values({ action: "RETURN_RECORDED", actorId, recordId: returnId, details: { saleId, returnNumber: created.returnNumber, totalRefundMinor: safeTotal, reason: input.reason } });
    await tx.insert(retailOutboxEvents).values({ eventId: randomUUID(), eventType: "SaleReturned", aggregateType: "Sale", aggregateId: saleId, payload: { schemaVersion: 1, returnId, saleId, receiptNumber: sale.receiptNumber, registerId: sale.registerId, actorId, locationId: sale.inventoryLocationId, warehouseManaged: sale.warehouseManaged, currency: sale.currency, returnedAt: created.createdAt.toISOString(), totalRefundMinor: safeTotal, tenders: persistedRefundTenders.map(({ id, method, amountMinor, status }) => ({ id, method, amountMinor, outcome: status })), lines: safeLines } });
    return created;
  });
  const [lines, tenders] = await Promise.all([db.select().from(retailReturnLines).where(eq(retailReturnLines.returnId, result.id)), db.select().from(retailReturnTenders).where(eq(retailReturnTenders.returnId, result.id))]);
  return res.status(201).json({ data: { ...result, lines, tenders } });
});

retailSalesRouter.get("/sales/:id", async (req, res) => res.json({ data: await getSale(uuid.parse(req.params.id)) }));

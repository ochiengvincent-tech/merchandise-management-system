import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import { inventoryLocation, inventoryProduct, inventoryStockAtLocation, releaseInventoryStock, reserveInventoryStock, searchInventoryProducts } from "./inventory-client.js";
import {
  completeSale,
  createPendingSale,
  createRegister,
  createSaleReturn,
  findActiveRegisterById,
  findActiveRegisters,
  findCompletedSales,
  findCurrentPrice,
  findPriorReturnRows,
  findRegisterById,
  findRegisterSalesTotals,
  findReturnByIdempotencyKey,
  findReturnDetails,
  findSaleById,
  findSaleByIdempotencyKey,
  findSaleDetails,
  findSaleLines,
  markSaleFailed,
  saveRetailPrice,
  type CheckoutPlan,
} from "./sales-repository.js";

export const listActiveRegisters = findActiveRegisters;
export const createRegisterService = createRegister;
export const getActiveRegister = findActiveRegisterById;
export const getRegisterById = findRegisterById;
export const getCurrentPrice = findCurrentPrice;
export const setRetailPrice = saveRetailPrice;
export const getSaleByIdempotencyKey = findSaleByIdempotencyKey;
export const createPendingSaleService = createPendingSale;
export const failSaleService = markSaleFailed;
export const completeSaleService = completeSale;
export const getRegisterSalesTotalsService = findRegisterSalesTotals;
export const getSaleLines = findSaleLines;
export const getPriorReturnRows = findPriorReturnRows;
export const getReturnByIdempotencyKey = findReturnByIdempotencyKey;
export const getReturnDetails = findReturnDetails;
export const createSaleReturnService = createSaleReturn;
export const getSaleById = async (saleId: string) => {
  const [sale] = await findSaleById(saleId);
  if (!sale) throw new AppError("Sale not found", 404);
  return sale;
};
export const lookupSaleById = findSaleById;

type ReturnInput = {
  reason: string;
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
};

export async function processSaleReturn(
  saleId: string,
  actorId: string,
  idempotencyKey: string,
  input: ReturnInput,
) {
  const requestHash = requestHashFor({ saleId, actorId, ...input });
  const [prior] = await findReturnByIdempotencyKey(idempotencyKey);
  if (prior) {
    if (prior.requestHash !== requestHash)
      throw new AppError("Idempotency-Key was already used with different return data", 409);
    const [lines, tenders] = await findReturnDetails(prior.id);
    return { result: { ...prior, lines, tenders }, replayed: true };
  }
  const [sale] = await findSaleById(saleId);
  if (!sale || sale.status !== "COMPLETED")
    throw new AppError("Only a completed sale can be returned", 409);
  const saleLines = await findSaleLines(saleId);
  const prepared = [];
  for (const requestLine of input.lines) {
    const line = saleLines.find((item) => item.id === requestLine.saleLineId);
    if (!line)
      throw new AppError("Return line does not belong to this sale", 400, [
        { field: "lines", message: "Select an item from this receipt." },
      ]);
    const previousRows = await findPriorReturnRows(line.id);
    const returnedQty = previousRows.reduce((n, row) => n + row.returnLine.quantity, 0);
    const refunded = previousRows.reduce((n, row) => n + row.returnLine.refundMinor, 0);
    if (returnedQty + requestLine.quantity > line.quantity)
      throw new AppError("Return quantity exceeds the remaining sale quantity", 409, [
        { field: "lines", message: `${line.nameSnapshot} has ${line.quantity - returnedQty} unit(s) remaining for return.` },
      ]);
    prepared.push({
      saleLineId: line.id,
      productId: line.productId,
      quantity: requestLine.quantity,
      refundMinor: Math.round((line.lineTotalMinor * (returnedQty + requestLine.quantity)) / line.quantity) - refunded,
      taxRefundMinor: Math.round((line.taxMinor * (returnedQty + requestLine.quantity)) / line.quantity) - Math.round((line.taxMinor * returnedQty) / line.quantity),
      disposition: requestLine.disposition,
    });
  }
  const totalRefundMinor = prepared.reduce((sum, line) => sum + line.refundMinor, 0);
  const tenderTotal = input.tenders.reduce((sum, tender) => sum + tender.amountMinor, 0);
  if (tenderTotal !== totalRefundMinor)
    throw new AppError("Refund tender amounts must match the return total", 400, [
      { field: "tenders", message: `Refund amount is KES ${(totalRefundMinor / 100).toFixed(2)}.` },
    ]);
  const result = await createSaleReturn({
    saleId,
    actorId,
    idempotencyKey,
    requestHash,
    returnId: randomUUID(),
    sale,
    saleLines,
    lines: input.lines,
    tenders: input.tenders,
    reason: input.reason,
  });
  const [lines, tenders] = await findReturnDetails(result.id);
  return { result: { ...result, lines, tenders }, replayed: false };
}

function requestHashFor(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const attachSaleDetails = async (
  sale: Awaited<ReturnType<typeof getSaleById>>,
) => {
  const { lines, tenders, returns } = await findSaleDetails(sale.id);
  const returnState = new Map<
    string,
    { quantity: number; refundMinor: number }
  >();
  for (const item of returns) {
    const current = returnState.get(item.saleLineId) ?? {
      quantity: 0,
      refundMinor: 0,
    };
    current.quantity += item.quantity;
    current.refundMinor += item.refundMinor;
    returnState.set(item.saleLineId, current);
  }
  return {
    ...sale,
    lines: lines.map((line) => ({
      ...line,
      returnedQuantity: returnState.get(line.id)?.quantity ?? 0,
      refundedMinor: returnState.get(line.id)?.refundMinor ?? 0,
    })),
    tenders,
  };
};

export const getSale = async (saleId: string) =>
  attachSaleDetails(await getSaleById(saleId));
export const listCompletedSales = findCompletedSales;

export async function createRetailRegister(input: {
  code: string;
  name: string;
  inventoryLocationId: string;
}, actorId: string) {
  const location = await inventoryLocation(input.inventoryLocationId);
  if (location.status !== "ACTIVE" || location.locationType !== "STORE")
    throw new AppError("Register must belong to an active store location", 400, [
      { field: "inventoryLocationId", message: "Choose an active Inventory location of type Store." },
    ]);
  return createRegister(input, actorId);
}

export async function searchProductsWithAvailability(q: string, registerId?: string) {
  const products = await searchInventoryProducts(q);
  if (!registerId) return products.map((product) => ({ ...product, quantityAvailable: null }));
  const [register] = await findActiveRegisterById(registerId);
  if (!register) throw new AppError("Active register not found", 404);
  const stock = await inventoryStockAtLocation(register.inventoryLocationId);
  const quantityByProduct = new Map(stock.map((item) => [item.productId, item.quantityAvailable]));
  return products.map((product) => ({ ...product, quantityAvailable: quantityByProduct.get(product.id) ?? 0 }));
}

export async function setRetailPriceForActiveProduct(
  productId: string,
  actorId: string,
  input: Parameters<typeof saveRetailPrice>[2],
  effectiveFrom: Date,
) {
  const product = await inventoryProduct(productId);
  if (product.status !== "ACTIVE")
    throw new AppError("Inactive products cannot be priced for sale", 409);
  return saveRetailPrice(productId, actorId, input, effectiveFrom);
}

export async function getRegisterAuditTotals(query: { registerId: string; from: Date; to: Date }) {
  if (query.from >= query.to)
    throw new AppError("Invalid reconciliation interval", 400, [
      { field: "to", message: "Choose an end time later than the start time." },
    ]);
  const [register] = await findRegisterById(query.registerId);
  if (!register) throw new AppError("Register not found", 404);
  const totals = await findRegisterSalesTotals(query);
  const tenderTotals: Record<string, { saleMinor: number; refundMinor: number }> = {
    CASH: { saleMinor: 0, refundMinor: 0 },
    CARD: { saleMinor: 0, refundMinor: 0 },
    GIFT_CARD: { saleMinor: 0, refundMinor: 0 },
  };
  for (const tender of totals.saleTenders) tenderTotals[tender.method]!.saleMinor += tender.amountMinor;
  for (const tender of totals.refundTenders) tenderTotals[tender.method]!.refundMinor += tender.amountMinor;
  return {
    registerId: query.registerId,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    currency: "KES",
    snapshotAt: totals.snapshotAt.toISOString(),
    saleCount: totals.sales.length,
    returnCount: totals.returns.length,
    tenderTotals,
  };
}

type CheckoutInput = {
  registerId: string;
  lines: Array<{ productId: string; quantity: number }>;
  tenders: CheckoutPlan["tenders"];
};

const requestHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function checkoutSale(input: CheckoutInput, actorId: string, idempotencyKey: string) {
  const hash = requestHash({ actorId, ...input });
  let [sale] = await findSaleByIdempotencyKey(idempotencyKey);
  if (sale && sale.requestHash !== hash) throw new AppError("Idempotency-Key was already used with different checkout data", 409);
  if (!sale) {
    const [register] = await findActiveRegisterById(input.registerId);
    if (!register) throw new AppError("Active register not found", 404);
    const location = await inventoryLocation(register.inventoryLocationId);
    if (location.status !== "ACTIVE" || location.locationType !== "STORE") throw new AppError("Register's Inventory location is unavailable", 409);
    const lines: CheckoutPlan["lines"] = [];
    for (const requested of input.lines) {
      const product = await inventoryProduct(requested.productId);
      if (product.status !== "ACTIVE") throw new AppError("Inactive products cannot be sold", 409, [{ field: "lines", message: `${product.sku} is inactive.` }]);
      const [price] = await findCurrentPrice(requested.productId, new Date());
      if (!price) throw new AppError("A current retail price is required for every item", 400, [{ field: "lines", message: `Set a retail price for ${product.name} before checkout.` }]);
      const base = price.amountMinor * requested.quantity;
      if (!Number.isSafeInteger(base) || base > 2147483647) throw new AppError("Line total exceeds the supported amount", 400, [{ field: "lines", message: `${product.name} total is too large for one sale line.` }]);
      const taxMinor = Math.round((base * price.taxRateBps) / 10000);
      lines.push({ productId: product.id, reservationId: randomUUID(), sku: product.sku, name: product.name, quantity: requested.quantity, unitPriceMinor: price.amountMinor, taxRateBps: price.taxRateBps, taxMinor, lineTotalMinor: base + taxMinor });
    }
    const subtotalMinor = lines.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0);
    const taxMinor = lines.reduce((total, line) => total + line.taxMinor, 0);
    const totalMinor = subtotalMinor + taxMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor > 2147483647) throw new AppError("Sale total exceeds the supported amount", 400);
    const tenderTotal = input.tenders.reduce((total, tender) => total + tender.amountMinor, 0);
    if (tenderTotal !== totalMinor) throw new AppError("Tender amounts must match the amount due", 400, [{ field: "tenders", message: `Amount due is KES ${(totalMinor / 100).toFixed(2)}; tendered KES ${(tenderTotal / 100).toFixed(2)}.` }]);
    const plan: CheckoutPlan = { registerId: register.id, locationId: location.id, warehouseManaged: location.warehouseManaged, actorId, lines, tenders: input.tenders, subtotalMinor, taxMinor, totalMinor };
    const saleId = randomUUID();
    const now = new Date();
    sale = await createPendingSale({ id: saleId, receiptNumber: `POS-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${saleId.slice(0, 8).toUpperCase()}`, registerId: register.id, inventoryLocationId: location.id, warehouseManaged: location.warehouseManaged, actorId, status: "PENDING", currency: "KES", subtotalMinor, taxMinor, totalMinor, idempotencyKey, requestHash: hash, reservationPlan: plan }, hash);
  }
  if (!sale) throw new Error("Checkout could not be started");
  if (sale.status === "COMPLETED") return { sale: await getSale(sale.id), replayed: true };
  if (sale.status === "FAILED") throw new AppError(sale.failureMessage ?? "This checkout attempt failed", 409);
  const plan = sale.reservationPlan as CheckoutPlan;
  try {
    for (const line of plan.lines) await reserveInventoryStock({ reservationId: line.reservationId, saleId: sale.id, productId: line.productId, locationId: plan.locationId, quantity: line.quantity, actorId: plan.actorId });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 503) throw new AppError("Checkout is pending Inventory confirmation. Retry with the same Idempotency-Key; do not start a second checkout.", 503);
    const releases = await Promise.allSettled(plan.lines.map((line) => releaseInventoryStock(line.reservationId, plan.actorId)));
    if (releases.some((result) => result.status === "rejected")) throw new AppError("Checkout is pending Inventory reservation cleanup. Retry with the same Idempotency-Key.", 503);
    await markSaleFailed(sale.id, error instanceof Error ? error.message : "Inventory rejected the reservation");
    throw error;
  }
  await completeSale(sale, plan);
  return { sale: await getSale(sale.id), replayed: false };
}

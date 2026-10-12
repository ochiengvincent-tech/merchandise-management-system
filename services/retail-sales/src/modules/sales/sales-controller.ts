import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import {
  attachSaleDetails as attachSaleDetailsService,
  getCurrentPrice,
  getRegisterAuditTotals,
  createRetailRegister,
  searchProductsWithAvailability,
  setRetailPriceForActiveProduct,
  getSale as getSaleService,
  listActiveRegisters,
  listCompletedSales,
  processSaleReturn,
  checkoutSale,
} from "./sales-service.js";
const uuid = z.uuid();
const actorFrom = (value: string | undefined) => {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    throw new AppError("A valid x-actor-id header is required", 400, [
      { field: "x-actor-id", message: "Provide the current employee UUID." },
    ]);
  return parsed.data;
};
const tenderSchema = z.object({
  method: z.enum(["CASH", "CARD", "GIFT_CARD"]),
  amountMinor: z.number().int().positive().max(2147483647),
  reference: z.string().trim().max(150).optional(),
});
const checkoutSchema = z
  .object({
    registerId: uuid,
    lines: z
      .array(
        z.object({
          productId: uuid,
          quantity: z.number().int().positive().max(100000),
        }),
      )
      .min(1)
      .max(100),
    tenders: z.array(tenderSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.lines.forEach((line, i) => {
      if (seen.has(line.productId))
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "productId"],
          message: "Add each product once and adjust its quantity.",
        });
      seen.add(line.productId);
    });
  });
async function attachSaleDetails(
  sale: Parameters<typeof attachSaleDetailsService>[0],
) {
  return attachSaleDetailsService(sale);
}
async function getSale(saleId: string) {
  return getSaleService(saleId);
}

export const getRegistersController: RequestHandler = async (_req, res) => {
  const data = await listActiveRegisters();
  return res.json({ data });
};

export const postRegistersController: RequestHandler = async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const input = z
    .object({
      code: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(150),
      inventoryLocationId: uuid,
    })
    .parse(req.body);
  const register = await createRetailRegister(input, actorId);
  return res.status(201).json({ data: register });
};

export const getProductsSearchController: RequestHandler = async (req, res) => {
  const { q, registerId } = z
    .object({
      q: z.string().trim().min(1).max(100),
      registerId: uuid.optional(),
    })
    .parse(req.query);
  return res.json({ data: await searchProductsWithAvailability(q, registerId) });
};

export const getPricesController: RequestHandler = async (req, res) => {
  const { productId } = z.object({ productId: uuid }).parse(req.query);
  const now = new Date();
  const [price] = await getCurrentPrice(productId, now);
  return res.json({ data: price ?? null });
};

export const putPricesProductIdController: RequestHandler = async (
  req,
  res,
) => {
  const productId = uuid.parse(req.params.productId);
  const actorId = actorFrom(req.header("x-actor-id"));
  const input = z
    .object({
      amountMinor: z.number().int().nonnegative().max(2147483647),
      taxRateBps: z.number().int().min(0).max(10000).default(0),
      currency: z.literal("KES").default("KES"),
      effectiveFrom: z.iso.datetime().optional(),
    })
    .parse(req.body);
  const effectiveFrom = input.effectiveFrom
    ? new Date(input.effectiveFrom)
    : new Date();
  const result = await setRetailPriceForActiveProduct(productId, actorId, input, effectiveFrom);
  return res.status(201).json({ data: result });
};

export const postSalesController: RequestHandler = async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = uuid.safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Use the same unique UUID when retrying this checkout." }]);
  const outcome = await checkoutSale(checkoutSchema.parse(req.body), actorId, idempotencyKey.data);
  return res.status(outcome.replayed ? 200 : 201).json({ data: outcome.sale });
};

export const getSalesAuditRegisterTotalsController: RequestHandler = async (
  req,
  res,
) => {
  const query = z
    .object({ registerId: uuid, from: z.coerce.date(), to: z.coerce.date() })
    .parse(req.query);
  return res.json({ data: await getRegisterAuditTotals(query) });
};

export const getSalesController: RequestHandler = async (req, res) => {
  const filter = z
    .object({
      search: z.string().trim().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(req.query);
  const rows = await listCompletedSales(filter.search, filter.limit);
  const data = await Promise.all(rows.map((row) => attachSaleDetails(row)));
  return res.json({ data });
};

export const postSalesIdReturnsController: RequestHandler = async (
  req,
  res,
) => {
  const saleId = uuid.parse(req.params.id);
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = uuid.safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success)
    throw new AppError("A UUID Idempotency-Key header is required", 400, [
      {
        field: "Idempotency-Key",
        message: "Provide a unique UUID for this return.",
      },
    ]);
  const input = z
    .object({
      reason: z.string().trim().min(1).max(255),
      lines: z
        .array(
          z.object({
            saleLineId: uuid,
            quantity: z.number().int().positive(),
            disposition: z.enum([
              "RESTOCK_SELLABLE",
              "QUARANTINE",
              "NO_STOCK_RETURN",
            ]),
          }),
        )
        .min(1),
      tenders: z.array(tenderSchema).min(1),
    })
    .superRefine((value, ctx) => {
      const ids = new Set<string>();
      value.lines.forEach((line, index) => {
        if (ids.has(line.saleLineId))
          ctx.addIssue({
            code: "custom",
            path: ["lines", index, "saleLineId"],
            message: "Each sale line can only appear once.",
          });
        ids.add(line.saleLineId);
      });
    })
    .parse(req.body);
  const outcome = await processSaleReturn(
    saleId,
    actorId,
    idempotencyKey.data,
    input,
  );
  return res.status(outcome.replayed ? 200 : 201).json({ data: outcome.result });
};

export const getSalesIdController: RequestHandler = async (req, res) =>
  res.json({ data: await getSale(uuid.parse(req.params.id)) });

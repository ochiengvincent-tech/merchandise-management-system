import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import {
  closePeriodService,
  createAccountService,
  getAccountsService,
  getAuditLogsService,
  getIncomeStatementService,
  getInventoryValueService,
  getJournalByIdService,
  getJournalsService,
  getPeriodsService,
  getPostingExceptionsService,
  getPostingMappingsService,
  getTrialBalanceService,
  reopenPeriodService,
  retryPostingEventService,
  reverseJournalService,
  savePostingMappingService,
} from "./ledger-service.js";
const idSchema = z.uuid();
const actor = (req: { header: (name: string) => string | undefined }) => {
  const parsed = idSchema.safeParse(req.header("x-actor-id"));
  if (!parsed.success)
    throw new AppError("A valid actor ID is required", 400, [
      { field: "x-actor-id", message: "Provide a valid UUID." },
    ]);
  return parsed.data;
};
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(100).optional(),
  accountCode: z.string().trim().max(30).optional(),
  sourceType: z.string().trim().max(50).optional(),
  actorId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const getAccountsController: RequestHandler = async (_req, res) => {
  const data = await getAccountsService();
  return res.json({ data });
};

export const postAccountsController: RequestHandler = async (req, res) => {
  const actorId = actor(req);
  const body = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{3,10}$/),
      name: z.string().trim().min(2).max(150),
      accountType: z.enum([
        "ASSET",
        "LIABILITY",
        "EQUITY",
        "REVENUE",
        "EXPENSE",
      ]),
      normalBalance: z.enum(["DEBIT", "CREDIT"]),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("KES"),
      parentCode: z
        .string()
        .trim()
        .regex(/^\d{3,10}$/)
        .optional(),
    })
    .parse(req.body);
  const account = await createAccountService(
    { ...body, parentCode: body.parentCode ?? null },
    actorId,
  );
  return res.status(201).json({ data: account });
};

export const getPostingMappingsController: RequestHandler = async (
  _req,
  res,
) => {
  const data = await getPostingMappingsService();
  return res.json({ data });
};

export const putPostingMappingsMappingKeyController: RequestHandler = async (
  req,
  res,
) => {
  const actorId = actor(req);
  const params = z
    .object({ mappingKey: z.string().regex(/^[A-Z_]{2,60}$/) })
    .parse(req.params);
  const { accountCode } = z
    .object({ accountCode: z.string().regex(/^\d{3,10}$/) })
    .parse(req.body);
  const mapping = await savePostingMappingService(
    params.mappingKey,
    accountCode,
    actorId,
  );
  return res.json({ data: mapping });
};

export const getJournalsController: RequestHandler = async (req, res) => {
  const query = listSchema.parse(req.query);
  const { data, total, summaries } = await getJournalsService(query);
  const amounts = new Map(
    summaries.map((row) => [
      row.journalId,
      { debitMinor: row.debit ?? "0", creditMinor: row.credit ?? "0" },
    ]),
  );
  return res.json({
    data: data.map((row) => ({ ...row, ...amounts.get(row.id) })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
};

export const getJournalsIdController: RequestHandler = async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const result = await getJournalByIdService(id);
  if (!result) throw new AppError("Journal not found", 404);
  const { journal, lines } = result;
  return res.json({
    data: {
      ...journal,
      lines: lines.map((line) => ({
        ...line,
        debitMinor: line.debitMinor.toString(),
        creditMinor: line.creditMinor.toString(),
      })),
    },
  });
};

export const postJournalsIdReverseController: RequestHandler = async (
  req,
  res,
) => {
  const actorId = actor(req);
  const id = idSchema.parse(req.params.id);
  const { reason } = z
    .object({ reason: z.string().trim().min(5).max(500) })
    .parse(req.body);
  const data = await reverseJournalService(id, actorId, reason);
  return res.status(201).json({ data });
};

export const getReportsTrialBalanceController: RequestHandler = async (
  req,
  res,
) => {
  const query = z
    .object({
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("KES"),
    })
    .parse(req.query);
  return res.json(await getTrialBalanceService(query));
};

export const getReportsIncomeStatementController: RequestHandler = async (
  req,
  res,
) => {
  const query = z
    .object({
      from: z.iso.date(),
      to: z.iso.date(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("KES"),
    })
    .parse(req.query);
  return res.json(await getIncomeStatementService(query));
};

export const getReportsInventoryValueController: RequestHandler = async (
  req,
  res,
) => {
  const query = z
    .object({
      asOf: z.iso.date().default(new Date().toISOString().slice(0, 10)),
      locationId: idSchema.optional(),
      productId: idSchema.optional(),
    })
    .parse(req.query);
  return res.json(await getInventoryValueService(query));
};

export const getPeriodsController: RequestHandler = async (_req, res) => {
  const data = await getPeriodsService();
  return res.json({ data });
};

export const postPeriodsPeriodKeyCloseController: RequestHandler = async (
  req,
  res,
) => {
  const actorId = actor(req);
  const { periodKey } = z
    .object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .parse(req.params);
  const result = await closePeriodService(periodKey, actorId);
  return res.json({ data: result });
};

export const postPeriodsPeriodKeyReopenController: RequestHandler = async (
  req,
  res,
) => {
  const actorId = actor(req);
  const { periodKey } = z
    .object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .parse(req.params);
  const { reason } = z
    .object({ reason: z.string().trim().min(5).max(500) })
    .parse(req.body);
  const result = await reopenPeriodService(periodKey, actorId, reason);
  return res.json({ data: result });
};

export const getPostingExceptionsController: RequestHandler = async (
  req,
  res,
) => {
  const query = z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      status: z.enum(["PENDING", "EXCEPTION"]).default("EXCEPTION"),
    })
    .parse(req.query);
  const { data, total } = await getPostingExceptionsService(query);
  return res.json({
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
};

export const postPostingExceptionsEventIdRetryController: RequestHandler =
  async (req, res) => {
    actor(req);
    const eventId = idSchema.parse(req.params.eventId);
    const data = await retryPostingEventService(eventId);
    return res.json({ data });
  };

export const getAuditLogsController: RequestHandler = async (req, res) => {
  const query = z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      action: z.string().trim().max(100).optional(),
      actorId: idSchema.optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    })
    .parse(req.query);
  const { data, total } = await getAuditLogsService(query);
  return res.json({
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
};

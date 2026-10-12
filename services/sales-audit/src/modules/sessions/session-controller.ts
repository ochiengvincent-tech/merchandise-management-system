import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import {
  approveCloseSession,
  getRegisterSessions,
  getRetailRegisters,
  getSessionDetail,
  getSessionTransactions,
  openRegisterSession,
  reconcileWithRetail,
  rejectCloseSession,
  submitCloseSession,
} from "./session-service.js";

const uuid = z.uuid();
const methods = ["CASH", "CARD", "GIFT_CARD"] as const;

function actorFrom(value: string | undefined) {
  const result = uuid.safeParse(value);
  if (!result.success) throw new AppError("A valid x-actor-id header is required", 400, [{ field: "x-actor-id", message: "Provide the current employee UUID." }]);
  return result.data;
}

function idempotencyKeyFrom(value: string | undefined) {
  const result = uuid.safeParse(value);
  if (!result.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Use the same unique UUID when retrying this request." }]);
  return result.data;
}

export const getRegistersController: RequestHandler = async (_req, res) => res.json({ data: await getRetailRegisters() });

export const postSessionsController: RequestHandler = async (req, res) => {
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = idempotencyKeyFrom(req.header("Idempotency-Key"));
  const input = z.object({ registerId: uuid, openingFloatMinor: z.number().int().nonnegative().max(2147483647) }).parse(req.body);
  const outcome = await openRegisterSession({ ...input, actorId, idempotencyKey });
  return res.status(outcome.replayed ? 200 : 201).json({ data: await getSessionDetail(outcome.sessionId) });
};

export const getSessionsController: RequestHandler = async (req, res) => {
  const filter = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), registerId: uuid.optional(), status: z.enum(["OPEN", "SUBMITTED", "APPROVED", "REJECTED", "EXCEPTION"]).optional() }).parse(req.query);
  const result = await getRegisterSessions(filter);
  return res.json({ data: result.data, pagination: { page: filter.page, limit: filter.limit, total: result.total, totalPages: Math.ceil(result.total / filter.limit) } });
};

export const getSessionsIdController: RequestHandler = async (req, res) => res.json({ data: await getSessionDetail(uuid.parse(req.params.id)) });

export const getSessionsIdTransactionsController: RequestHandler = async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  const filter = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
  return res.json(await getSessionTransactions(sessionId, filter.page, filter.limit));
};

export const postSessionsIdSubmitController: RequestHandler = async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  const actorId = actorFrom(req.header("x-actor-id"));
  const idempotencyKey = idempotencyKeyFrom(req.header("Idempotency-Key"));
  const input = z.object({ countedTotals: z.array(z.object({ method: z.enum(methods), amountMinor: z.number().int().nonnegative().max(2147483647) })).length(3), varianceExplanations: z.record(z.string(), z.string().trim().max(500)) }).parse(req.body);
  const result = await submitCloseSession({ sessionId, actorId, idempotencyKey, countedTotals: input.countedTotals, varianceExplanations: input.varianceExplanations });
  if (result.duplicate) return res.json({ data: await getSessionDetail(sessionId) });
  return res.status(201).json({ data: await getSessionDetail(sessionId) });
};

export const postSessionsIdReconcileController: RequestHandler = async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  actorFrom(req.header("x-actor-id"));
  await reconcileWithRetail(sessionId);
  return res.json({ data: await getSessionDetail(sessionId) });
};

export const postSessionsIdApproveController: RequestHandler = async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  const actorId = actorFrom(req.header("x-actor-id"));
  z.object({}).parse(req.body ?? {});
  const outcome = await approveCloseSession(sessionId, actorId);
  return res.status(outcome.replayed ? 200 : 201).json({ data: { ...(await getSessionDetail(sessionId)), decision: outcome.decision } });
};

export const postSessionsIdRejectController: RequestHandler = async (req, res) => {
  const sessionId = uuid.parse(req.params.id);
  const actorId = actorFrom(req.header("x-actor-id"));
  const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
  const outcome = await rejectCloseSession(sessionId, actorId, reason);
  return res.status(outcome.replayed ? 200 : 201).json({ data: await getSessionDetail(sessionId) });
};

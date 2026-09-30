import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ error: { message: "Validation failed", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) } });
  if (error instanceof AppError) return res.status(error.statusCode).json({ error: { message: error.message, ...(error.details.length ? { details: error.details } : {}) } });
  console.error("Sales Audit request failed:", error);
  return res.status(500).json({ error: { message: "Internal server error" } });
};

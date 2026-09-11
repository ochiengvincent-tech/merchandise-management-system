import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        details: error.issues
      }
    });
  }

  if (error instanceof Error) {
    return res.status(400).json({
      error: {
        message: error.message
      }
    });
  }

  return res.status(500).json({
    error: {
      message: "Internal server error"
    }
  });
};
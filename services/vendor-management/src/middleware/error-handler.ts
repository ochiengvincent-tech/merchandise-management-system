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
    const isConflict = /already exists|already supplies|already inactive|already active|Cannot add product to an inactive vendor/.test(
      error.message,
    );
    const isExpectedClientError = /Invalid .* ID/.test(error.message);
    const status = isConflict ? 409 : isExpectedClientError ? 400 : 500;

    return res.status(status).json({
      error: {
        message: status === 500 ? "Internal server error" : error.message
      }
    });
  }

  return res.status(500).json({
    error: {
      message: "Internal server error"
    }
  });
};

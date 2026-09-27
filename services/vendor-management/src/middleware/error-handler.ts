import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        details: error.issues.map((issue) => ({
          ...(issue.path.length > 0
            ? { field: issue.path.map(String).join(".") }
            : {}),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details,
      },
    });
  }

  if (error instanceof Error) {
    return res.status(500).json({
      error: {
        message: "Internal server error",
      },
    });
  }

  return res.status(500).json({
    error: {
      message: "Internal server error",
    },
  });
};

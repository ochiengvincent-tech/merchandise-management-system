import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        details: error.issues,
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
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

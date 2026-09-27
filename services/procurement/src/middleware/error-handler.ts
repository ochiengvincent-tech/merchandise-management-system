import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
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

  console.error(error);

  return res.status(500).json({
    error: {
      message: "Internal server error",
    },
  });
}

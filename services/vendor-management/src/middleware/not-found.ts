import type { Request, Response, NextFunction } from "express";

export function notFoundHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  return res.status(404).json({
    error: {
      message: "Route not found",
    },
  });
}
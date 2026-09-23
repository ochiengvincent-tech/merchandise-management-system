import type { Request, Response, NextFunction } from "express";

export function methodNotAllowed(
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  return res.status(405).json({
    error: {
      message: "Method not allowed",
    },
  });
}
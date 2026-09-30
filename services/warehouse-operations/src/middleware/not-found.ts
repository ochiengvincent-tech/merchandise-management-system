import type { RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (_req, res) => {
  return res.status(404).json({ error: { message: "Route not found" } });
};

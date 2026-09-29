import type { RequestHandler } from "express";
export const methodNotAllowed: RequestHandler = (_req, res) => res.status(405).json({ error: { message: "Method not allowed" } });

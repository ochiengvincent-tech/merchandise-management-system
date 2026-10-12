import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { listReorderSuggestionsService, updateReorderSuggestionStatus } from "./reorder-suggestion-service.js";

const idSchema = z.uuid();
const convertBodySchema = z.object({ purchaseOrderId: z.uuid() });

export async function listReorderSuggestionsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const suggestions = await listReorderSuggestionsService();
    return res.status(200).json({ data: suggestions });
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(
  req: Request,
  res: Response,
  next: NextFunction,
  status: "CONVERTED" | "DISMISSED",
) {
  try {
    const id = idSchema.parse(req.params.id);
    const purchaseOrderId = status === "CONVERTED" ? convertBodySchema.parse(req.body).purchaseOrderId : undefined;
    const suggestion = await updateReorderSuggestionStatus(id, status, purchaseOrderId);

    return res.status(200).json({ data: suggestion });
  } catch (error) {
    return next(error);
  }
}

export const convertReorderSuggestionController = (
  req: Request,
  res: Response,
  next: NextFunction,
) => updateStatus(req, res, next, "CONVERTED");

export const dismissReorderSuggestionController = (
  req: Request,
  res: Response,
  next: NextFunction,
) => updateStatus(req, res, next, "DISMISSED");

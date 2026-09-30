import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { findPurchaseOrderLines } from "../purchase-orders/purchase-order-line-repository.js";
import { findPurchaseOrderById } from "../purchase-orders/purchase-order-repository.js";
import {
  findPendingReorderSuggestion,
  listReorderSuggestions,
  setReorderSuggestionStatus,
} from "./reorder-suggestion-repository.js";

const idSchema = z.uuid();
const convertBodySchema = z.object({ purchaseOrderId: z.uuid() });

export async function listReorderSuggestionsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const suggestions = await listReorderSuggestions();
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
    let purchaseOrderId: string | undefined;

    if (status === "CONVERTED") {
      purchaseOrderId = convertBodySchema.parse(req.body).purchaseOrderId;
      const [suggestion, purchaseOrder] = await Promise.all([
        findPendingReorderSuggestion(id),
        findPurchaseOrderById(purchaseOrderId),
      ]);

      if (!suggestion) {
        throw new AppError(
          "Reorder suggestion not found or no longer pending",
          404,
        );
      }
      if (!purchaseOrder) {
        throw new AppError("Purchase order not found", 404);
      }
      if (purchaseOrder.status !== "DRAFT") {
        throw new AppError(
          "Only a draft purchase order can be linked to a reorder suggestion",
          409,
        );
      }
      if (purchaseOrder.destinationLocationId !== suggestion.locationId) {
        throw new AppError("Draft destination does not match the reorder suggestion", 409);
      }

      const lines = await findPurchaseOrderLines(purchaseOrderId);
      if (!lines.some((line) => line.productId === suggestion.productId)) {
        throw new AppError("Draft does not contain the suggested product", 409);
      }
    }

    const suggestion = await setReorderSuggestionStatus(id, status, purchaseOrderId);
    if (!suggestion) {
      throw new AppError("Reorder suggestion not found or no longer pending", 404);
    }

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

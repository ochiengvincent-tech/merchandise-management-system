import {
  createReorderSuggestion as insertReorderSuggestion,
  findPendingReorderSuggestion,
  findPendingReorderSuggestionForProductLocation,
  listReorderSuggestions,
  setReorderSuggestionStatus,
} from "./reorder-suggestion-repository.js";
import { AppError } from "../../errors/app-error.js";
import { findPurchaseOrderLines } from "../purchase-orders/purchase-order-line-repository.js";
import { findPurchaseOrderById } from "../purchase-orders/purchase-order-repository.js";

export const listReorderSuggestionsService = listReorderSuggestions;

export async function updateReorderSuggestionStatus(
  id: string,
  status: "CONVERTED" | "DISMISSED",
  purchaseOrderId?: string,
) {
  if (status === "CONVERTED") {
    if (!purchaseOrderId) throw new AppError("A purchase order is required", 400);
    const [suggestion, purchaseOrder] = await Promise.all([
      findPendingReorderSuggestion(id),
      findPurchaseOrderById(purchaseOrderId),
    ]);
    if (!suggestion) throw new AppError("Reorder suggestion not found or no longer pending", 404);
    if (!purchaseOrder) throw new AppError("Purchase order not found", 404);
    if (purchaseOrder.status !== "DRAFT")
      throw new AppError("Only a draft purchase order can be linked to a reorder suggestion", 409);
    if (purchaseOrder.destinationLocationId !== suggestion.locationId)
      throw new AppError("Draft destination does not match the reorder suggestion", 409);
    const lines = await findPurchaseOrderLines(purchaseOrderId);
    if (!lines.some((line) => line.productId === suggestion.productId))
      throw new AppError("Draft does not contain the suggested product", 409);
  }
  const suggestion = await setReorderSuggestionStatus(id, status, purchaseOrderId);
  if (!suggestion) throw new AppError("Reorder suggestion not found or no longer pending", 404);
  return suggestion;
}

type StockLowEvent = {
  eventId: string;
  eventType: "StockLow";
  productId: string;
  locationId: string;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  reorderLevel: number;
};

export async function createReorderSuggestion(event: StockLowEvent) {
  const existingSuggestion =
    await findPendingReorderSuggestionForProductLocation(
      event.productId,
      event.locationId,
    );

  if (existingSuggestion) {
    return existingSuggestion;
  }

  const suggestedQuantity = event.reorderLevel - event.quantityAvailable;

  if (suggestedQuantity <= 0) {
    return null;
  }

  const [suggestion] = await insertReorderSuggestion({
    eventId: event.eventId,
    productId: event.productId,
    locationId: event.locationId,
    quantityOnHand: event.quantityOnHand,
    quantityAllocated: event.quantityAllocated,
    quantityAvailable: event.quantityAvailable,
    reorderLevel: event.reorderLevel,
    suggestedQuantity,
  });

  return suggestion;
}

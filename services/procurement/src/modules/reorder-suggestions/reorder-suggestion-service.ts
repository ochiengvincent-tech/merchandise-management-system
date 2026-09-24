import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reorderSuggestions } from "../../db/schema/index.js";

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

export async function createReorderSuggestion(
  event: StockLowEvent,
) {
  const existingSuggestion = await db.query.reorderSuggestions.findFirst({
    where: and(
      eq(reorderSuggestions.productId, event.productId),
      eq(reorderSuggestions.locationId, event.locationId),
      eq(reorderSuggestions.status, "PENDING"),
    ),
  });

  if (existingSuggestion) {
    return existingSuggestion;
  }

  const suggestedQuantity =
    event.reorderLevel - event.quantityAvailable;

  if (suggestedQuantity <= 0) {
    return null;
  }

  const [suggestion] = await db
    .insert(reorderSuggestions)
    .values({
      eventId: event.eventId,
      productId: event.productId,
      locationId: event.locationId,
      quantityOnHand: event.quantityOnHand,
      quantityAllocated: event.quantityAllocated,
      quantityAvailable: event.quantityAvailable,
      reorderLevel: event.reorderLevel,
      suggestedQuantity,
    })
    .returning();

  return suggestion;
}
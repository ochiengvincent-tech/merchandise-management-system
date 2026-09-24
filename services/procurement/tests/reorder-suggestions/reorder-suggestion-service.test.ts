import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "../../src/db/index.js";
import { reorderSuggestions } from "../../src/db/schema/index.js";
import { createReorderSuggestion } from "../../src/modules/reorder-suggestions/reorder-suggestion-service.js";

const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";

const createEvent = (overrides = {}) => ({
  eventId: crypto.randomUUID(),
  eventType: "StockLow" as const,
  productId: PRODUCT_ID,
  locationId: LOCATION_ID,
  quantityOnHand: 10,
  quantityAllocated: 3,
  quantityAvailable: 7,
  reorderLevel: 20,
  ...overrides,
});

afterEach(async () => {
  await db
    .delete(reorderSuggestions)
    .where(
      and(
        eq(reorderSuggestions.productId, PRODUCT_ID),
        eq(reorderSuggestions.locationId, LOCATION_ID),
      ),
    );
});

describe("createReorderSuggestion", () => {
  it("creates a reorder suggestion with the correct suggested quantity", async () => {
    const event = createEvent();

    const result = await createReorderSuggestion(event);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      eventId: event.eventId,
      productId: PRODUCT_ID,
      locationId: LOCATION_ID,
      quantityOnHand: 10,
      quantityAllocated: 3,
      quantityAvailable: 7,
      reorderLevel: 20,
      suggestedQuantity: 13,
      status: "PENDING",
    });
  });

  it("returns the existing pending suggestion instead of creating a duplicate", async () => {
    const firstEvent = createEvent();

    const firstResult = await createReorderSuggestion(firstEvent);

    const secondEvent = createEvent({
      quantityOnHand: 8,
      quantityAllocated: 2,
      quantityAvailable: 6,
      reorderLevel: 20,
    });

    const secondResult = await createReorderSuggestion(secondEvent);

    expect(secondResult).not.toBeNull();
    expect(secondResult?.id).toBe(firstResult?.id);

    const suggestions = await db
      .select()
      .from(reorderSuggestions)
      .where(
        and(
          eq(reorderSuggestions.productId, PRODUCT_ID),
          eq(reorderSuggestions.locationId, LOCATION_ID),
          eq(reorderSuggestions.status, "PENDING"),
        ),
      );

    expect(suggestions).toHaveLength(1);
  });

  it("does not create a suggestion when available quantity is above the reorder level", async () => {
    const event = createEvent({
      quantityOnHand: 25,
      quantityAllocated: 2,
      quantityAvailable: 23,
      reorderLevel: 20,
    });

    const result = await createReorderSuggestion(event);

    expect(result).toBeNull();

    const suggestions = await db
      .select()
      .from(reorderSuggestions)
      .where(
        and(
          eq(reorderSuggestions.productId, PRODUCT_ID),
          eq(reorderSuggestions.locationId, LOCATION_ID),
        ),
      );

    expect(suggestions).toHaveLength(0);
  });
});

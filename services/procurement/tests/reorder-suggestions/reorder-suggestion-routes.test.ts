import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import app from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  purchaseOrderLines,
  purchaseOrders,
  reorderSuggestions,
} from "../../src/db/schema/index.js";

const productId = randomUUID();
const otherProductId = randomUUID();
const locationId = randomUUID();
const otherLocationId = randomUUID();
const vendorId = randomUUID();
const actorId = randomUUID();

let suggestionId = "";
let purchaseOrderIds: string[] = [];

async function createPendingSuggestion() {
  const [suggestion] = await db
    .insert(reorderSuggestions)
    .values({
      eventId: randomUUID(),
      productId,
      locationId,
      quantityOnHand: 4,
      quantityAllocated: 1,
      quantityAvailable: 3,
      reorderLevel: 10,
      suggestedQuantity: 7,
    })
    .returning();
  if (!suggestion) throw new Error("Failed to create reorder suggestion test fixture");

  suggestionId = suggestion.id;
  return suggestion;
}

async function createDraftPurchaseOrder(input: {
  destinationLocationId?: string;
  lineProductId?: string;
  status?: string;
} = {}) {
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: `PO-REORDER-${randomUUID()}`,
      vendorId,
      destinationLocationId: input.destinationLocationId ?? locationId,
      createdBy: actorId,
      status: input.status ?? "DRAFT",
    })
    .returning();
  if (!purchaseOrder) throw new Error("Failed to create purchase-order test fixture");

  purchaseOrderIds.push(purchaseOrder.id);
  await db.insert(purchaseOrderLines).values({
    purchaseOrderId: purchaseOrder.id,
    productId: input.lineProductId ?? productId,
    quantityOrdered: 7,
    unitPrice: "2.00",
    lineTotal: "14.00",
  });

  return purchaseOrder;
}

beforeEach(async () => {
  await createPendingSuggestion();
});

afterEach(async () => {
  if (suggestionId) {
    await db
      .delete(reorderSuggestions)
      .where(eq(reorderSuggestions.id, suggestionId));
  }

  for (const purchaseOrderId of purchaseOrderIds) {
    await db
      .delete(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
    await db
      .delete(purchaseOrders)
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  suggestionId = "";
  purchaseOrderIds = [];
});

describe("reorder suggestion routes", () => {
  it("lists pending suggestions", async () => {
    const response = await request(app).get("/api/v1/reorder-suggestions");

    expect(response.status).toBe(200);
    expect(response.body.data).toContainEqual(
      expect.objectContaining({
        id: suggestionId,
        productId,
        locationId,
        suggestedQuantity: 7,
        status: "PENDING",
        purchaseOrderId: null,
      }),
    );
  });

  it("links a matching draft purchase order and removes the suggestion from the pending queue", async () => {
    const purchaseOrder = await createDraftPurchaseOrder();

    const convertResponse = await request(app)
      .patch(`/api/v1/reorder-suggestions/${suggestionId}/convert`)
      .send({ purchaseOrderId: purchaseOrder.id });

    expect(convertResponse.status).toBe(200);
    expect(convertResponse.body.data).toMatchObject({
      id: suggestionId,
      status: "CONVERTED",
      purchaseOrderId: purchaseOrder.id,
    });

    const listResponse = await request(app).get("/api/v1/reorder-suggestions");
    expect(listResponse.body.data).not.toContainEqual(
      expect.objectContaining({ id: suggestionId }),
    );
  });

  it("rejects a draft with a different destination and leaves the suggestion pending", async () => {
    const purchaseOrder = await createDraftPurchaseOrder({
      destinationLocationId: otherLocationId,
    });

    const response = await request(app)
      .patch(`/api/v1/reorder-suggestions/${suggestionId}/convert`)
      .send({ purchaseOrderId: purchaseOrder.id });

    expect(response.status).toBe(409);
    const [suggestion] = await db
      .select()
      .from(reorderSuggestions)
      .where(eq(reorderSuggestions.id, suggestionId));
    if (!suggestion) throw new Error("Reorder suggestion fixture was not found");
    expect(suggestion.status).toBe("PENDING");
    expect(suggestion.purchaseOrderId).toBeNull();
  });

  it("rejects a draft that does not contain the suggested product", async () => {
    const purchaseOrder = await createDraftPurchaseOrder({
      lineProductId: otherProductId,
    });

    const response = await request(app)
      .patch(`/api/v1/reorder-suggestions/${suggestionId}/convert`)
      .send({ purchaseOrderId: purchaseOrder.id });

    expect(response.status).toBe(409);
  });

  it("dismisses a suggestion from the pending queue", async () => {
    const response = await request(app).patch(
      `/api/v1/reorder-suggestions/${suggestionId}/dismiss`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: suggestionId,
      status: "DISMISSED",
      purchaseOrderId: null,
    });
  });
});

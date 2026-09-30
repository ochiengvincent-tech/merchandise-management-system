import { describe, expect, it } from "vitest";
import {
  api,
  actorId,
  createLocation,
  createProduct,
  createStock,
  setStockQuantity,
} from "./helpers.js";

describe("Adjustments API", () => {
  it("records a positive adjustment and updates available stock", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);

    const response = await api.post("/api/v1/adjustments").send({
      productId: product.id,
      locationId: location.id,
      quantityChange: 7,
      reason: "Cycle count",
      reference: "COUNT-1",
      createdBy: actorId,
    });

    expect(response.status).toBe(201);
    expect(response.body.stock).toMatchObject({
      quantityOnHand: 7,
      quantityAvailable: 7,
    });
    expect(response.body.adjustment).toMatchObject({
      quantityChange: 7,
      reason: "Cycle count",
      reference: "COUNT-1",
    });
  });

  it("rejects adjustments that violate stock constraints", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    await setStockQuantity(product.id, location.id, 2);

    const response = await api.post("/api/v1/adjustments").send({
      productId: product.id,
      locationId: location.id,
      quantityChange: -3,
      reason: "Invalid count",
      createdBy: actorId,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("Adjustment would result in negative stock or reduce stock below allocated quantity");
    expect(response.body.error.details).toContainEqual({
      field: "quantityChange",
      message: "Review the latest stock and allocated quantities, then try again.",
    });
  });
  it("returns 405 for unsupported methods on known routes", async () => {
    const response = await api.get("/api/v1/adjustments");

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Method not allowed",
      },
    });
  });
});

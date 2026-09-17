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

    const response = await api.post("/adjustments").send({
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

    const response = await api.post("/adjustments").send({
      productId: product.id,
      locationId: location.id,
      quantityChange: -3,
      reason: "Invalid count",
      createdBy: actorId,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
    expect(response.body.error.details).toContainEqual({
      field: "quantityChange",
      message: "Adjustment would result in negative stock",
    });
  });
});

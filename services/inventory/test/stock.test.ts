import { describe, expect, it } from "vitest";
import {
  api,
  actorId,
  createLocation,
  createProduct,
  createStock,
  setStockQuantity,
} from "./helpers.js";

describe("Stock API", () => {
  it("creates stock and reads it by product and location", async () => {
    const product = await createProduct();
    const location = await createLocation();
    const stock = await createStock(product.id, location.id);

    const response = await api
      .get("/api/v1/stock/by-product-and-location")
      .query({
        productId: product.id,
        locationId: location.id,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: stock.id,
      productId: product.id,
      locationId: location.id,
      quantityOnHand: 0,
      quantityAllocated: 0,
      quantityAvailable: 0,
    });
  });

  it("adjusts, allocates, and releases stock", async () => {
    const product = await createProduct({ reorderLevel: 2 });
    const location = await createLocation();
    await createStock(product.id, location.id);
    await setStockQuantity(product.id, location.id, 10);

    const allocateResponse = await api.post("/api/v1/stock/allocate").send({
      productId: product.id,
      locationId: location.id,
      quantity: 4,
      actorId,
    });
    expect(allocateResponse.status).toBe(200);
    expect(allocateResponse.body.stock).toMatchObject({
      quantityOnHand: 10,
      quantityAllocated: 4,
      quantityAvailable: 6,
    });

    const releaseResponse = await api.post("/api/v1/stock/release").send({
      productId: product.id,
      locationId: location.id,
      quantity: 2,
      actorId,
    });
    expect(releaseResponse.status).toBe(200);
    expect(releaseResponse.body).toMatchObject({
      quantityOnHand: 10,
      quantityAllocated: 2,
      quantityAvailable: 8,
    });
  });

  it("rejects allocation beyond available stock and release beyond allocation", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    await setStockQuantity(product.id, location.id, 2);

    const allocation = await api.post("/api/v1/stock/allocate").send({
      productId: product.id,
      locationId: location.id,
      quantity: 3,
      actorId,
    });
    expect(allocation.status).toBe(400);

    const release = await api.post("/api/v1/stock/release").send({
      productId: product.id,
      locationId: location.id,
      quantity: 1,
      actorId,
    });
    expect(release.status).toBe(400);
  });

  it("rejects duplicate stock records", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);

    const response = await api
      .post("/api/v1/stock")
      .send({ productId: product.id, locationId: location.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      message: "Validation failed",
    });
    expect(response.body.error.details).toContainEqual({
      field: "stock",
      message: "Stock record already exists",
    });
  });

  it("rejects stock creation for an inactive location", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await api.patch(`/api/v1/locations/${location.id}/deactivate`);

    const response = await api
      .post("/api/v1/stock")
      .send({ productId: product.id, locationId: location.id });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual({
      field: "locationId",
      message: "Location is inactive",
    });
  });
  it("returns 405 for unsupported methods on known routes", async () => {
    const response = await api.delete("/api/v1/stock/by-product");

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Method not allowed",
      },
    });
  });
});

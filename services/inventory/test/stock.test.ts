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

    const response = await api.get("/stock/by-product-and-location").query({
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

    const allocateResponse = await api.post("/stock/allocate").send({
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

    const releaseResponse = await api.post("/stock/release").send({
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

    const allocation = await api.post("/stock/allocate").send({
      productId: product.id,
      locationId: location.id,
      quantity: 3,
      actorId,
    });
    expect(allocation.status).toBe(400);

    const release = await api.post("/stock/release").send({
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
      .post("/stock")
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
    await api.patch(`/locations/${location.id}/deactivate`);

    const response = await api
      .post("/stock")
      .send({ productId: product.id, locationId: location.id });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual({
      field: "locationId",
      message: "Location is inactive",
    });
  });
});

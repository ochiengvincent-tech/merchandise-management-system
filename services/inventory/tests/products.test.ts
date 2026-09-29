import { describe, expect, it } from "vitest";
import { api, createProduct } from "./helpers.js";

describe("Products API", () => {
  it("creates and retrieves a product", async () => {
    const product = await createProduct({ barcode: "BARCODE-1" });

    const response = await api.get(`/api/v1/products/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: product.id,
      sku: product.sku,
      barcode: "BARCODE-1",
      status: "ACTIVE",
      reorderLevel: 2,
    });
  });

  it("lists, updates, deactivates, and reactivates a product", async () => {
    const product = await createProduct({ category: "FILTER-ME" });

    const listResponse = await api
      .get("/api/v1/products")
      .query({ category: "FILTER-ME" });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);

    const updateResponse = await api
      .patch(`/api/v1/products/${product.id}`)
      .send({ name: "Updated Product", reorderLevel: 5 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      name: "Updated Product",
      reorderLevel: 5,
    });

    expect(
      (await api.patch(`/api/v1/products/${product.id}/deactivate`)).status,
    ).toBe(200);
    expect((await api.get(`/api/v1/products/${product.id}`)).body.status).toBe(
      "INACTIVE",
    );
    expect(
      (await api.patch(`/api/v1/products/${product.id}/reactivate`)).body
        .status,
    ).toBe("ACTIVE");
  });

  it("rejects invalid product input and duplicate SKUs", async () => {
    const product = await createProduct();
    const invalidResponse = await api
      .post("/api/v1/products")
      .send({ name: "Missing fields" });
    expect(invalidResponse.status).toBe(400);

    const duplicateResponse = await api.post("/api/v1/products").send({
      sku: product.sku,
      name: "Duplicate",
      category: "TEST",
      unitOfMeasure: "EACH",
    });
    expect(duplicateResponse.status).toBe(400);
  });

  it("does not allow inventory operations for an inactive product", async () => {
    const product = await createProduct();
    const locationResponse = await api.post("/api/v1/locations").send({
      locationCode: `LOC-${product.id}`,
      name: "Test Warehouse",
      locationType: "WAREHOUSE",
    });
    const location = locationResponse.body;

    await api.patch(`/api/v1/products/${product.id}/deactivate`);

    const stockResponse = await api
      .post("/api/v1/stock")
      .send({ productId: product.id, locationId: location.id });

    expect(stockResponse.status).toBe(400);
    expect(stockResponse.body.error).toMatchObject({
      message: "Validation failed",
    });
    expect(stockResponse.body.error.details).toContainEqual({
      field: "productId",
      message: "Product is inactive",
    });
  });
  it("returns 405 for unsupported methods on known routes", async () => {
    const product = await createProduct();

    const collectionResponse = await api.delete("/api/v1/products");

    expect(collectionResponse.status).toBe(405);
    expect(collectionResponse.body).toEqual({
      error: {
        message: "Method not allowed",
      },
    });

    const itemResponse = await api.post(`/api/v1/products/${product.id}`);

    expect(itemResponse.status).toBe(405);

    const unknownResponse = await api.get(
      "/api/v1/products/00000000-0000-4000-8000-000000000000",
    );

    expect(unknownResponse.status).toBe(404);
  });
});

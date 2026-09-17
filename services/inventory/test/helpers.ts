import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";

export const api = request(app);

export const actorId = randomUUID();

export const createProduct = async (
  overrides: Record<string, unknown> = {},
) => {
  const response = await api.post("/products").send({
    sku: `SKU-${randomUUID()}`,
    name: "Test Product",
    category: "TEST",
    unitOfMeasure: "EACH",
    reorderLevel: 2,
    ...overrides,
  });

  expect(response.status).toBe(201);
  return response.body;
};

export const createLocation = async (
  overrides: Record<string, unknown> = {},
) => {
  const response = await api.post("/locations").send({
    locationCode: `LOC-${randomUUID()}`,
    name: "Test Warehouse",
    locationType: "WAREHOUSE",
    ...overrides,
  });

  expect(response.status).toBe(201);
  return response.body;
};

export const createStock = async (productId: string, locationId: string) => {
  const response = await api.post("/stock").send({ productId, locationId });
  expect(response.status).toBe(201);
  return response.body;
};

export const setStockQuantity = async (
  productId: string,
  locationId: string,
  quantityChange: number,
) => {
  const response = await api.post("/adjustments").send({
    productId,
    locationId,
    quantityChange,
    reason: "Test stock adjustment",
    createdBy: actorId,
  });
  expect(response.status).toBe(201);
  return response.body;
};

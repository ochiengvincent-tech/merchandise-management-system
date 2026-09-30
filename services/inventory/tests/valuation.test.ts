import request from "supertest";
import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { inventoryLocations, inventoryStock, products } from "../src/db/schema/index.js";
import { app } from "../src/app.js";

async function createStockRecord(input: {
  sku: string;
  productName: string;
  locationCode: string;
  locationName: string;
  quantityOnHand: number;
  quantityAllocated: number;
  unitCost: string;
}) {
  const [product] = await db
    .insert(products)
    .values({
      sku: input.sku,
      name: input.productName,
      category: "Test",
      unitOfMeasure: "each",
    })
    .returning();
  const [location] = await db
    .insert(inventoryLocations)
    .values({
      locationCode: input.locationCode,
      name: input.locationName,
      locationType: "WAREHOUSE",
    })
    .returning();

  await db.insert(inventoryStock).values({
    productId: product.id,
    locationId: location.id,
    quantityOnHand: input.quantityOnHand,
    quantityAllocated: input.quantityAllocated,
    unitCost: input.unitCost,
  });

  return { product, location };
}

describe("GET /api/v1/stock/valuation", () => {
  it("returns per-location on-hand values and an exact total", async () => {
    const first = await createStockRecord({
      sku: "VALUATION-001",
      productName: "Valuation item",
      locationCode: "VAL-01",
      locationName: "Warehouse A",
      quantityOnHand: 3,
      quantityAllocated: 1,
      unitCost: "0.10",
    });
    await createStockRecord({
      sku: "VALUATION-002",
      productName: "Valuation item",
      locationCode: "VAL-02",
      locationName: "Warehouse B",
      quantityOnHand: 5,
      quantityAllocated: 0,
      unitCost: "0.20",
    });

    const response = await request(app).get("/api/v1/stock/valuation");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: "KES",
      totalValue: "1.30",
    });
    expect(response.body.records).toHaveLength(2);
    expect(response.body.records).toContainEqual(
      expect.objectContaining({
        productId: first.product.id,
        locationId: first.location.id,
        quantityOnHand: 3,
        quantityAllocated: 1,
        unitCost: "0.10",
        extendedValue: "0.30",
      }),
    );
  });

  it("returns zero total when there are no stock records", async () => {
    const response = await request(app).get("/api/v1/stock/valuation");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: "KES",
      totalValue: "0.00",
      records: [],
    });
  });
});

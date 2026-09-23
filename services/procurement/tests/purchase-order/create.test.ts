import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

describe("POST /api/v1/purchase-orders", () => {
  it("creates a purchase order using the authoritative vendor price", async () => {
    const poNumber = `PO-TEST-${Date.now()}`;

    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
      purchaseOrder: {
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        status: "DRAFT",
        currency: "KES",
        paymentTerms: "NET 30",
        createdBy: ACTOR_ID,
      },
      lines: [
        {
          productId: PRODUCT_ID,
          quantityOrdered: 2,
          quantityReceived: 0,
        },
      ],
    });

    expect(response.body.data.purchaseOrder.subtotal).toBe("7000.00");
    expect(response.body.data.purchaseOrder.totalAmount).toBe("7000.00");
    expect(response.body.data.lines[0].unitPrice).toBe("3500.00");
    expect(response.body.data.lines[0].lineTotal).toBe("7000.00");
  });

  it("rejects a duplicate purchase order number", async () => {
    const poNumber = `PO-DUPLICATE-${Date.now()}`;

    const payload = {
      poNumber,
      vendorId: VENDOR_ID,
      destinationLocationId: LOCATION_ID,
      currency: "KES",
      lines: [
        {
          productId: PRODUCT_ID,
          quantityOrdered: 2,
        },
      ],
      createdBy: ACTOR_ID,
    };

    const firstResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send(payload);

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send(payload);

    expect(secondResponse.status).toBe(409);

    expect(secondResponse.body).toEqual({
      error: {
        message: "Purchase order number already exists",
      },
    });
  });
  it("rejects duplicate products in the same purchase order", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-DUPLICATE-PRODUCT-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2,
          },
          {
            productId: PRODUCT_ID,
            quantityOrdered: 3,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(400);

    expect(response.body.error.message).toBe(
      `Product ${PRODUCT_ID} cannot appear more than once in a purchase order`,
    );
  });
  it("rejects a non-positive ordered quantity", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-INVALID-QTY-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 0,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(400);

    expect(response.body.error).toBeDefined();
  });
  it("rejects a non-integer ordered quantity", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-FRACTIONAL-QTY-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2.5,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(400);

    expect(response.body.error).toBeDefined();
  });
  it("rejects a purchase order when the vendor does not exist", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-VENDOR-NOT-FOUND-${Date.now()}`,
        vendorId: "99999999-9999-4999-8999-999999999999",
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(404);

    expect(response.body.error.message).toBe("Vendor not found");
  });
  it("rejects a purchase order when the destination location does not exist", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-LOCATION-NOT-FOUND-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: "99999999-9999-4999-8999-999999999999",
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(404);

    expect(response.body.error.message).toBe("Destination location not found");
  });
  it("rejects an invalid currency code", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-INVALID-CURRENCY-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "kes",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(400);

    expect(response.body.error).toBeDefined();
  });
  it("rejects a purchase order when the product does not exist in Inventory", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-PRODUCT-NOT-FOUND-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: "650e8400-e29b-41d4-a716-446655440000",
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(404);

    expect(response.body.error.message).toBe("Product not found");
  });

  it("rejects a purchase order when the vendor does not supply the product", async () => {
    const response = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-VENDOR-PRODUCT-NOT-SUPPLIED-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: "db9d3e94-95fe-4a72-9b7d-1c0e969e0e80",
            quantityOrdered: 2,
          },
        ],
        createdBy: ACTOR_ID,
      });

    expect(response.status).toBe(409);

    expect(response.body.error.message).toBe(
      "Vendor does not supply product db9d3e94-95fe-4a72-9b7d-1c0e969e0e80",
    );
  });
});

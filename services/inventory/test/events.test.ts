import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  api,
  createLocation,
  createProduct,
  createStock,
  setStockQuantity,
} from "./helpers.js";

describe("Inventory events", () => {
  it("creates a StockLow event when available stock reaches the reorder level", async () => {
    const product = await createProduct({ reorderLevel: 5 });
    const location = await createLocation();
    await createStock(product.id, location.id);
    await setStockQuantity(product.id, location.id, 6);

    const response = await api.post("/api/v1/stock/allocate").send({
      productId: product.id,
      locationId: location.id,
      quantity: 1,
      actorId: randomUUID(),
    });

    expect(response.status).toBe(200);
    expect(response.body.stockLowEvent).toMatchObject({
      eventType: "StockLow",
      aggregateType: "PRODUCT",
    });
    expect(response.body.stockLowEvent.payload).toMatchObject({
      eventType: "StockLow",
      productId: product.id,
      locationId: location.id,
      quantityAvailable: 5,
      reorderLevel: 5,
    });
  });

  it("increments on-order stock for approved purchase orders and is idempotent", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    const eventId = randomUUID();
    const purchaseOrderId = randomUUID();
    const event = {
      eventId,
      eventType: "PurchaseOrderApproved",
      purchaseOrderId,
      lines: [
        { productId: product.id, locationId: location.id, quantityOrdered: 8 },
      ],
    };

    const first = await api
      .post("/api/v1/events/purchase-order-approved")
      .send(event);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      processed: true,
      eventId,
      purchaseOrderId,
    });

    const second = await api
      .post("/api/v1/events/purchase-order-approved")
      .send(event);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      processed: false,
      reason: "Event already processed",
    });

    const stock = await api.get("/api/v1/stock/by-product-and-location").query({
      productId: product.id,
      locationId: location.id,
    });
    expect(stock.body.quantityOnOrder).toBe(8);
  });

  it("handles concurrent delivery of the same purchase-order event idempotently", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    const event = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderApproved",
      purchaseOrderId: randomUUID(),
      lines: [
        { productId: product.id, locationId: location.id, quantityOrdered: 8 },
      ],
    };

    const responses = await Promise.all([
      api.post("/api/v1/events/purchase-order-approved").send(event),
      api.post("/api/v1/events/purchase-order-approved").send(event),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200,
    ]);
    expect(responses.map((response) => response.body.processed).sort()).toEqual(
      [false, true],
    );

    const stock = await api.get("/api/v1/stock/by-product-and-location").query({
      productId: product.id,
      locationId: location.id,
    });
    expect(stock.body.quantityOnOrder).toBe(8);
  });

  it("rolls back earlier lines when a later purchase-order line fails", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    const event = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderApproved",
      purchaseOrderId: randomUUID(),
      lines: [
        { productId: product.id, locationId: location.id, quantityOrdered: 8 },
        {
          productId: product.id,
          locationId: randomUUID(),
          quantityOrdered: 4,
        },
      ],
    };

    const response = await api
      .post("/api/v1/events/purchase-order-approved")
      .send(event);

    expect(response.status).toBe(400);
    const stock = await api.get("/api/v1/stock/by-product-and-location").query({
      productId: product.id,
      locationId: location.id,
    });
    expect(stock.body.quantityOnOrder).toBe(0);
  });

  it("decrements on-order stock for cancelled purchase orders", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    const approvedEvent = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderApproved",
      purchaseOrderId: randomUUID(),
      lines: [
        { productId: product.id, locationId: location.id, quantityOrdered: 8 },
      ],
    };
    await api
      .post("/api/v1/events/purchase-order-approved")
      .send(approvedEvent);

    const cancelledEvent = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderCancelled",
      purchaseOrderId: approvedEvent.purchaseOrderId,
      lines: [
        {
          productId: product.id,
          locationId: location.id,
          quantityRemaining: 3,
        },
      ],
    };
    const response = await api
      .post("/api/v1/events/purchase-order-cancelled")
      .send(cancelledEvent);

    expect(response.status).toBe(200);
    const stock = await api.get("/api/v1/stock/by-product-and-location").query({
      productId: product.id,
      locationId: location.id,
    });
    expect(stock.body.quantityOnOrder).toBe(5);
  });

  it("rejects cancellation greater than the on-order quantity", async () => {
    const product = await createProduct();
    const location = await createLocation();
    await createStock(product.id, location.id);
    const event = {
      eventId: randomUUID(),
      eventType: "PurchaseOrderCancelled",
      purchaseOrderId: randomUUID(),
      lines: [
        {
          productId: product.id,
          locationId: location.id,
          quantityRemaining: 1,
        },
      ],
    };

    const response = await api
      .post("/api/v1/events/purchase-order-cancelled")
      .send(event);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
    expect(response.body.error.details).toContainEqual({
      field: "lines.0.quantityRemaining",
      message: `Cancellation quantity exceeds on-order quantity for product ${product.id}`,
    });

    const stock = await api.get("/api/v1/stock/by-product-and-location").query({
      productId: product.id,
      locationId: location.id,
    });
    expect(stock.body.quantityOnOrder).toBe(0);
  });
  it("returns 405 for unsupported methods on known routes", async () => {
    const response = await api.get("/api/v1/events/purchase-order-approved");

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Method not allowed",
      },
    });
  });
});

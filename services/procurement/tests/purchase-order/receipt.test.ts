import request from "supertest";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import app from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { outboxEvents } from "../../src/db/schema/outbox-events.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

describe("receive purchase order", () => {
  it("completes a purchase order when the full quantity is received", async () => {
    const poNumber = `PO-RECEIVE-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.data.status).toBe("SENT");

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 5,
          },
        ],
      });

    expect(receiveResponse.status).toBe(200);

    expect(receiveResponse.body.data.purchaseOrder).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "COMPLETED",
    });

    expect(receiveResponse.body.data.lines[0]).toMatchObject({
      id: purchaseOrderLineId,
      quantityOrdered: 5,
      quantityReceived: 5,
    });
  });

  it("marks a purchase order as partially received before completion", async () => {
    const poNumber = `PO-RECEIVE-PARTIAL-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const partialReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 2,
          },
        ],
      });

    expect(partialReceiveResponse.status).toBe(200);

    expect(partialReceiveResponse.body.data.purchaseOrder.status).toBe(
      "PARTIALLY_RECEIVED",
    );

    expect(partialReceiveResponse.body.data.lines[0]).toMatchObject({
      id: purchaseOrderLineId,
      quantityOrdered: 5,
      quantityReceived: 2,
    });

    const finalReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 3,
          },
        ],
      });

    expect(finalReceiveResponse.status).toBe(200);

    expect(finalReceiveResponse.body.data.purchaseOrder.status).toBe(
      "COMPLETED",
    );

    expect(finalReceiveResponse.body.data.lines[0]).toMatchObject({
      id: purchaseOrderLineId,
      quantityOrdered: 5,
      quantityReceived: 5,
    });
  });

  it("rejects receiving more than the ordered quantity", async () => {
    const poNumber = `PO-RECEIVE-OVERAGE-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 6,
          },
        ],
      });

    expect(receiveResponse.status).toBe(409);

    expect(receiveResponse.body.error.message).toBe(
      "Received quantity cannot exceed ordered quantity",
    );
  });

  it("rejects receiving goods for a purchase order that is not sent", async () => {
    const poNumber = `PO-RECEIVE-INVALID-STATUS-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 1,
          },
        ],
      });

    expect(receiveResponse.status).toBe(409);

    expect(receiveResponse.body.error.message).toBe(
      "Purchase order cannot receive goods in its current state",
    );
  });

  it("rejects receiving more than the remaining quantity", async () => {
    const poNumber = `PO-RECEIVE-REMAINING-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const firstReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 3,
          },
        ],
      });

    expect(firstReceiveResponse.status).toBe(200);

    expect(firstReceiveResponse.body.data.purchaseOrder.status).toBe(
      "PARTIALLY_RECEIVED",
    );

    const secondReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 3,
          },
        ],
      });

    expect(secondReceiveResponse.status).toBe(409);

    expect(secondReceiveResponse.body.error.message).toBe(
      "Received quantity cannot exceed ordered quantity",
    );
  });

  it("rejects duplicate purchase order lines in a receipt", async () => {
    const poNumber = `PO-RECEIVE-DUPLICATE-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 1,
          },
          {
            purchaseOrderLineId,
            quantityReceived: 1,
          },
        ],
      });

    expect(receiveResponse.status).toBe(400);

    expect(receiveResponse.body.error.message).toBe(
      "A purchase order line cannot appear more than once in a receipt",
    );
  });

  it("rejects a purchase order line that does not belong to the purchase order", async () => {
    const firstPoNumber = `PO-RECEIVE-LINE-1-${Date.now()}`;
    const secondPoNumber = `PO-RECEIVE-LINE-2-${Date.now()}`;

    const firstCreateResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: firstPoNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(firstCreateResponse.status).toBe(201);

    const firstPurchaseOrderId = firstCreateResponse.body.data.purchaseOrder.id;

    const secondCreateResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: secondPoNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(secondCreateResponse.status).toBe(201);

    const secondPurchaseOrderLineId =
      secondCreateResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${firstPurchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${firstPurchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${firstPurchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${firstPurchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId: secondPurchaseOrderLineId,
            quantityReceived: 1,
          },
        ],
      });

    expect(receiveResponse.status).toBe(404);

    expect(receiveResponse.body.error.message).toBe(
      "Purchase order line not found",
    );
  });

  it("rejects a receipt with no items", async () => {
    const purchaseOrderId = "8031547a-4764-42c5-ba00-7cc1607ef37c";

    const response = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [],
      });

    expect(response.status).toBe(400);

    expect(response.body.error.message).toBe("Invalid receipt data");
  });

  it("rejects a receipt with an invalid actor ID", async () => {
    const purchaseOrderId = "8031547a-4764-42c5-ba00-7cc1607ef37c";

    const response = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", "invalid-actor-id")
      .send({
        items: [
          {
            purchaseOrderLineId: "8031547a-4764-42c5-ba00-7cc1607ef37c",
            quantityReceived: 1,
          },
        ],
      });

    expect(response.status).toBe(400);

    expect(response.body.error.message).toBe("Invalid actor ID");
  });

  it("rejects receiving goods for a completed purchase order", async () => {
    const poNumber = `PO-RECEIVE-COMPLETED-${Date.now()}`;

    const createResponse = await request(app)
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
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const firstReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 2,
          },
        ],
      });

    expect(firstReceiveResponse.status).toBe(200);
    expect(firstReceiveResponse.body.data.purchaseOrder.status).toBe(
      "COMPLETED",
    );

    const secondReceiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 1,
          },
        ],
      });

    expect(secondReceiveResponse.status).toBe(409);

    expect(secondReceiveResponse.body.error.message).toBe(
      "Purchase order cannot receive goods in its current state",
    );
  });

  it("creates a pending PurchaseOrderReceived outbox event when goods are received", async () => {
    const poNumber = `PO-RECEIVE-OUTBOX-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [
          {
            productId: PRODUCT_ID,
            quantityOrdered: 5,
          },
        ],
        createdBy: CREATOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const purchaseOrderLineId = createResponse.body.data.lines[0].id;

    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    expect(submitResponse.status).toBe(200);

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(200);

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId,
            quantityReceived: 5,
          },
        ],
      });

    expect(receiveResponse.status).toBe(200);

    const events = await db
  .select()
  .from(outboxEvents)
  .where(
    and(
      eq(outboxEvents.aggregateId, purchaseOrderId),
      eq(outboxEvents.eventType, "PurchaseOrderReceived"),
    ),
  );

expect(events).toHaveLength(1);

expect(events[0]).toMatchObject({
  eventType: "PurchaseOrderReceived",
  aggregateType: "PurchaseOrder",
  aggregateId: purchaseOrderId,
  status: "PENDING",
  attempts: 0,
});

expect(events[0].payload).toMatchObject({
  purchaseOrderId,
  lines: [
    {
      productId: PRODUCT_ID,
      locationId: LOCATION_ID,
      quantityReceived: 5,
    },
  ],
});
  })
});

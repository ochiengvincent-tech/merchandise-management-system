import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

describe("cancel purchase order", () => {
  it("cancels a draft purchase order", async () => {
    const poNumber = `PO-CANCEL-${Date.now()}`;

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

    const cancelResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set("x-actor-id", CREATOR_ID);

    expect(cancelResponse.status).toBe(200);

    expect(cancelResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "CANCELLED",
    });
  });
  it("rejects cancellation of a completed purchase order", async () => {
    const poNumber = `PO-CANCEL-COMPLETED-${Date.now()}`;

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

    const lineId = (
      await request(app).get(`/api/v1/purchase-orders/${purchaseOrderId}`)
    ).body.data.lines[0].id;

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .send({
        items: [
          {
            purchaseOrderLineId: lineId,
            quantityReceived: 2,
          },
        ],
      })
      .set("x-actor-id", CREATOR_ID);

    expect(receiveResponse.status).toBe(200);
    expect(receiveResponse.body.data.purchaseOrder.status).toBe("COMPLETED");

    const cancelResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set("x-actor-id", CREATOR_ID);

    expect(cancelResponse.status).toBe(409);

    expect(cancelResponse.body.error.message).toBe(
      "Purchase order cannot be cancelled in its current state",
    );
  });

  it("cancels a sent purchase order", async () => {
    const poNumber = `PO-CANCEL-SENT-${Date.now()}`;

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

    const cancelResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set("x-actor-id", CREATOR_ID);

    expect(cancelResponse.status).toBe(200);

    expect(cancelResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "CANCELLED",
    });
  });
  it("cancels a partially received purchase order", async () => {
    const poNumber = `PO-CANCEL-PARTIAL-${Date.now()}`;

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

    const purchaseOrderResponse = await request(app).get(
      `/api/v1/purchase-orders/${purchaseOrderId}`,
    );

    expect(purchaseOrderResponse.status).toBe(200);

    const lineId = purchaseOrderResponse.body.data.lines[0].id;

    const receiveResponse = await request(app)
      .post(`/api/v1/purchase-orders/${purchaseOrderId}/receipts`)
      .set("x-actor-id", CREATOR_ID)
      .send({
        items: [
          {
            purchaseOrderLineId: lineId,
            quantityReceived: 2,
          },
        ],
      });

    expect(receiveResponse.status).toBe(200);

    expect(receiveResponse.body.data.purchaseOrder.status).toBe(
      "PARTIALLY_RECEIVED",
    );

    const cancelResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set("x-actor-id", CREATOR_ID);

    expect(cancelResponse.status).toBe(200);

    expect(cancelResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "CANCELLED",
    });

    expect(cancelResponse.body.data.status).toBe("CANCELLED");
  });
});

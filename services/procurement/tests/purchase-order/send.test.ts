import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

describe("send purchase order", () => {
  it("sends an approved purchase order", async () => {
    const poNumber = `PO-SEND-${Date.now()}`;

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
    expect(approveResponse.body.data.status).toBe("APPROVED");

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);
    expect(sendResponse.status).toBe(200);

    expect(sendResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "SENT",
    });
  });
  it("rejects sending a purchase order that is not approved", async () => {
    const poNumber = `PO-SEND-INVALID-${Date.now()}`;

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

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", CREATOR_ID);

    expect(sendResponse.status).toBe(409);

    expect(sendResponse.body.error.message).toBe(
      "Only approved purchase orders can be sent",
    );
  });
});

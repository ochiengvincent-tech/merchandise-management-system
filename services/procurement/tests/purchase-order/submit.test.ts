import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

describe("submit purchase order for approval", () => {
  it("submits a draft purchase order for approval", async () => {
    const poNumber = `PO-SUBMIT-${Date.now()}`;

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
        createdBy: ACTOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;

    const response = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: ACTOR_ID,
      });

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "PENDING_APPROVAL",
    });
  });
});

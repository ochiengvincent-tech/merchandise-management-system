import request from "supertest";
import { describe, expect, it } from "vitest";

import { env } from "../../src/config/env.js";
import app from "../../src/app.js";
import { assertPurchaseOrderWithinLimit } from "../../src/modules/submissions/purchase-order-submission-service.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

describe("submit purchase order for approval", () => {
  it("allows a purchase order exactly at the configured limit", () => {
    expect(() =>
      assertPurchaseOrderWithinLimit("500000.00", 500_000),
    ).not.toThrow();
  });

  it("rejects a purchase order one cent above the configured limit", () => {
    expect(() => assertPurchaseOrderWithinLimit("500000.01", 500_000)).toThrow(
      "PO total KES 500000.01 exceeds the maximum allowed value of KES 500000.00",
    );
  });

  it("returns the configured maximum through the purchase-order policy endpoint", async () => {
    const response = await request(app).get("/api/v1/purchase-orders/policy");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      currency: "KES",
      maxPoValueKes: `${env.MAX_PO_VALUE_KES.toFixed(2)}`,
    });
  });

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

    const auditResponse = await request(app)
      .get("/api/v1/audit-logs")
      .query({ action: "PO_SUBMITTED_FOR_APPROVAL", actorId: ACTOR_ID });
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        purchaseOrderId,
        action: "PO_SUBMITTED_FOR_APPROVAL",
        actorId: ACTOR_ID,
      }),
    ]));
    expect(auditResponse.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

  it("requires a changed PO field after rejection before resubmission", async () => {
    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-REVISE-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        notes: "Original notes",
        lines: [{ productId: PRODUCT_ID, quantityOrdered: 2 }],
        createdBy: ACTOR_ID,
      });

    expect(createResponse.status).toBe(201);
    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;

    const firstSubmitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({ actorId: ACTOR_ID });
    expect(firstSubmitResponse.status).toBe(200);

    const rejectResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/reject`)
      .send({ approverId: APPROVER_ID, comments: "Please revise the notes" });
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.data).toMatchObject({
      status: "DRAFT",
      revisionRequired: true,
    });

    const unchangedSubmitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({ actorId: ACTOR_ID });
    expect(unchangedSubmitResponse.status).toBe(409);
    expect(unchangedSubmitResponse.body.error.message).toBe(
      "Purchase order must be revised before it can be resubmitted",
    );

    const unchangedUpdateResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .send({ actorId: ACTOR_ID, notes: "Original notes" });
    expect(unchangedUpdateResponse.status).toBe(400);
    expect(unchangedUpdateResponse.body.error).toMatchObject({
      message: "Change at least one purchase-order field before saving",
      details: [],
    });

    const revisionResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .send({ actorId: ACTOR_ID, notes: "Revised notes" });
    expect(revisionResponse.status).toBe(200);
    expect(revisionResponse.body.data.revisionRequired).toBe(false);

    const resubmitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({ actorId: ACTOR_ID });
    expect(resubmitResponse.status).toBe(200);
    expect(resubmitResponse.body.data.status).toBe("PENDING_APPROVAL");
  });

  it("leaves an over-limit PO as a draft when submission is rejected", async () => {
    const poNumber = `PO-OVER-LIMIT-${Date.now()}`;
    const quantityOverLimit = Math.floor(env.MAX_PO_VALUE_KES / 3500) + 1;
    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        lines: [{ productId: PRODUCT_ID, quantityOrdered: quantityOverLimit }],
        createdBy: ACTOR_ID,
      });

    expect(createResponse.status).toBe(201);
    expect(
      Number(createResponse.body.data.purchaseOrder.totalAmount),
    ).toBeGreaterThan(env.MAX_PO_VALUE_KES);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({ actorId: ACTOR_ID });

    expect(submitResponse.status).toBe(409);
    expect(submitResponse.body.error.message).toContain(
      "exceeds the maximum allowed value",
    );

    const getResponse = await request(app).get(
      `/api/v1/purchase-orders/${purchaseOrderId}`,
    );
    expect(getResponse.body.data.status).toBe("DRAFT");
  });

  it("rejects non-KES purchase orders from submission under the KES policy", async () => {
    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber: `PO-NON-KES-${Date.now()}`,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "USD",
        lines: [{ productId: PRODUCT_ID, quantityOrdered: 2 }],
        createdBy: ACTOR_ID,
      });

    expect(createResponse.status).toBe(201);

    const purchaseOrderId = createResponse.body.data.purchaseOrder.id;
    const submitResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({ actorId: ACTOR_ID });

    expect(submitResponse.status).toBe(409);
    expect(submitResponse.body.error.message).toContain(
      "Only KES purchase orders can be submitted",
    );
  });
});

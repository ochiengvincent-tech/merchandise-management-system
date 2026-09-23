import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

describe("approve purchase order", () => {
  it("approves a purchase order submitted for approval", async () => {
    const poNumber = `PO-APPROVE-${Date.now()}`;

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

    expect(submitResponse.body.data.status).toBe("PENDING_APPROVAL");

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    expect(approveResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "APPROVED",
      approvedBy: APPROVER_ID,
    });

    expect(approveResponse.body.data.approvedAt).toBeTruthy();
  });
  it("rejects approval when the purchase order creator is the approver", async () => {
    const poNumber = `PO-APPROVE-SELF-${Date.now()}`;

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
        approverId: CREATOR_ID,
      });

    expect(approveResponse.status).toBe(409);

    expect(approveResponse.body.error.message).toBe(
      "Purchase order creator cannot approve their own purchase order",
    );
  });
  it("rejects a purchase order and returns it to draft", async () => {
    const poNumber = `PO-REJECT-${Date.now()}`;

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

    const rejectResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/reject`)
      .send({
        approverId: APPROVER_ID,
        comments: "Please review the requested quantity",
      });

    expect(rejectResponse.status).toBe(200);

    expect(rejectResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      poNumber,
      status: "DRAFT",
    });
  });
  it("allows only one concurrent approval", async () => {
    const poNumber = `PO-APPROVE-CONCURRENT-${Date.now()}`;

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

    const [firstApproval, secondApproval] = await Promise.all([
      request(app)
        .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
        .send({
          approverId: APPROVER_ID,
        }),
      request(app)
        .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
        .send({
          approverId: APPROVER_ID,
        }),
    ]);

    const statuses = [firstApproval.status, secondApproval.status].sort();

    expect(statuses).toEqual([200, 409]);

    const successfulApproval =
      firstApproval.status === 200 ? firstApproval : secondApproval;

    expect(successfulApproval.body.data).toMatchObject({
      id: purchaseOrderId,
      status: "APPROVED",
      approvedBy: APPROVER_ID,
    });
  });
  it("allows only one concurrent rejection", async () => {
    const poNumber = `PO-REJECT-CONCURRENT-${Date.now()}`;

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

    const [firstRejection, secondRejection] = await Promise.all([
      request(app)
        .patch(`/api/v1/purchase-orders/${purchaseOrderId}/reject`)
        .send({
          approverId: APPROVER_ID,
          comments: "Review required",
        }),
      request(app)
        .patch(`/api/v1/purchase-orders/${purchaseOrderId}/reject`)
        .send({
          approverId: APPROVER_ID,
          comments: "Review required",
        }),
    ]);

    const statuses = [firstRejection.status, secondRejection.status].sort();

    expect(statuses).toEqual([200, 409]);

    const successfulRejection =
      firstRejection.status === 200 ? firstRejection : secondRejection;

    expect(successfulRejection.body.data).toMatchObject({
      id: purchaseOrderId,
      status: "DRAFT",
    });
  });
});

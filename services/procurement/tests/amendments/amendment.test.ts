import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

const VENDOR_ID = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const PRODUCT_ID = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const LOCATION_ID = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

describe("purchase order amendments", () => {
  it("creates a pending amendment for an approved purchase order", async () => {
    const poNumber = `PO-AMEND-${Date.now()}`;

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

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Destination location changed",
        destinationLocationId: LOCATION_ID,
      });

    expect(amendmentResponse.status).toBe(201);

    expect(amendmentResponse.body.data).toMatchObject({
      purchaseOrderId,
      amendmentNumber: 1,
      requestedBy: CREATOR_ID,
      reason: "Destination location changed",
      status: "PENDING",
    });

    expect(amendmentResponse.body.data.newData).toMatchObject({
      destinationLocationId: LOCATION_ID,
    });
  });

  it("approves an amendment and applies the changes to the purchase order", async () => {
    const poNumber = `PO-AMEND-APPROVE-${Date.now()}`;

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

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Destination location changed",
        destinationLocationId: LOCATION_ID,
        notes: "Updated receiving destination",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const amendmentApprovalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(amendmentApprovalResponse.status).toBe(200);

    expect(amendmentApprovalResponse.body.data.amendment).toMatchObject({
      id: amendmentId,
      status: "APPROVED",
      approvedBy: APPROVER_ID,
    });

    expect(amendmentApprovalResponse.body.data.purchaseOrder).toMatchObject({
      id: purchaseOrderId,
      destinationLocationId: LOCATION_ID,
      notes: "Updated receiving destination",
    });
  });

  it("rejects amendment approval by the requester", async () => {
    const poNumber = `PO-AMEND-SOD-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Destination location changed",
        destinationLocationId: LOCATION_ID,
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const approvalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: CREATOR_ID,
      });

    expect(approvalResponse.status).toBe(409);

    expect(approvalResponse.body.error.message).toBe(
      "Amendment requester cannot approve their own amendment",
    );
  });
  it("rejects an amendment without changing the purchase order", async () => {
    const poNumber = `PO-AMEND-REJECT-${Date.now()}`;

    const createResponse = await request(app)
      .post("/api/v1/purchase-orders")
      .send({
        poNumber,
        vendorId: VENDOR_ID,
        destinationLocationId: LOCATION_ID,
        currency: "KES",
        notes: "Original PO notes",
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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Update PO notes",
        notes: "Changed notes",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const rejectionResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/reject`)
      .send({
        approverId: APPROVER_ID,
        comments: "Change is not required",
      });

    expect(rejectionResponse.status).toBe(200);

    expect(rejectionResponse.body.data).toMatchObject({
      id: amendmentId,
      status: "REJECTED",
    });

    const purchaseOrderResponse = await request(app).get(
      `/api/v1/purchase-orders/${purchaseOrderId}`,
    );

    expect(purchaseOrderResponse.status).toBe(200);

    expect(purchaseOrderResponse.body.data).toMatchObject({
      id: purchaseOrderId,
      status: "APPROVED",
      notes: "Original PO notes",
    });
  });
  it("rejects amendment rejection by the requester", async () => {
    const poNumber = `PO-AMEND-REJECT-SOD-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Update PO notes",
        notes: "Changed notes",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const rejectionResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/reject`)
      .send({
        approverId: CREATOR_ID,
      });

    expect(rejectionResponse.status).toBe(409);

    expect(rejectionResponse.body.error.message).toBe(
      "Amendment requester cannot reject their own amendment",
    );
  });
  it("rejects approving an already approved amendment", async () => {
    const poNumber = `PO-AMEND-REAPPROVE-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Update PO notes",
        notes: "Changed notes",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const firstApprovalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(firstApprovalResponse.status).toBe(200);

    const secondApprovalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(secondApprovalResponse.status).toBe(409);

    expect(secondApprovalResponse.body.error.message).toBe(
      "Purchase order amendment is not pending approval",
    );
  });
  it("rejects approving an already rejected amendment", async () => {
    const poNumber = `PO-AMEND-REJECTED-APPROVE-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Update PO notes",
        notes: "Changed notes",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const rejectionResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/reject`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(rejectionResponse.status).toBe(200);

    const approvalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approvalResponse.status).toBe(409);

    expect(approvalResponse.body.error.message).toBe(
      "Purchase order amendment is not pending approval",
    );
  });
  it("rejects an amendment request with no changes", async () => {
    const poNumber = `PO-AMEND-NO-CHANGE-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "No actual changes",
      });

    expect(amendmentResponse.status).toBe(400);

    expect(amendmentResponse.body.error.message).toBe(
      "At least one amendment field is required",
    );
  });
  it("rejects an amendment request with a blank reason", async () => {
    const poNumber = `PO-AMEND-BLANK-REASON-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "   ",
        notes: "Changed notes",
      });

    expect(amendmentResponse.status).toBe(400);

    expect(amendmentResponse.body.error.message).toBe(
      "Amendment reason is required",
    );
  });
  it("rejects an amendment request for a draft purchase order", async () => {
    const poNumber = `PO-AMEND-DRAFT-${Date.now()}`;

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

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Change destination",
        destinationLocationId: LOCATION_ID,
      });

    expect(amendmentResponse.status).toBe(409);

    expect(amendmentResponse.body.error.message).toBe(
      "Only approved or sent purchase orders can be amended",
    );
  });
  it("rejects an amendment with a nonexistent destination location", async () => {
    const poNumber = `PO-AMEND-INVALID-LOCATION-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Destination location changed",
        destinationLocationId: "650e8400-e29b-41d4-a716-446655440000",
      });

    expect(amendmentResponse.status).toBe(404);

    expect(amendmentResponse.body.error.message).toBe(
      "Destination location not found",
    );
  });
  it("rejects an amendment with a nonexistent destination location", async () => {
    const poNumber = `PO-AMEND-INVALID-LOCATION-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Destination location changed",
        destinationLocationId: "650e8400-e29b-41d4-a716-446655440000",
      });

    expect(amendmentResponse.status).toBe(404);

    expect(amendmentResponse.body.error.message).toBe(
      "Destination location not found",
    );
  });
  it("approves an amendment for a sent purchase order", async () => {
    const poNumber = `PO-AMEND-SENT-${Date.now()}`;

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

    await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/submit`)
      .send({
        actorId: CREATOR_ID,
      });

    const approveResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approveResponse.status).toBe(200);

    const sendResponse = await request(app)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/send`)
      .set("x-actor-id", APPROVER_ID);

    expect(sendResponse.status).toBe(200);

    const amendmentResponse = await request(app)
      .post(`/api/v1/amendments/purchase-orders/${purchaseOrderId}`)
      .send({
        requestedBy: CREATOR_ID,
        reason: "Update PO notes",
        notes: "Updated after sending",
      });

    expect(amendmentResponse.status).toBe(201);

    const amendmentId = amendmentResponse.body.data.id;

    const approvalResponse = await request(app)
      .patch(`/api/v1/amendments/${amendmentId}/approve`)
      .send({
        approverId: APPROVER_ID,
      });

    expect(approvalResponse.status).toBe(200);

    expect(approvalResponse.body.data.amendment).toMatchObject({
      id: amendmentId,
      status: "APPROVED",
      approvedBy: APPROVER_ID,
    });

    expect(approvalResponse.body.data.purchaseOrder).toMatchObject({
      id: purchaseOrderId,
      status: "SENT",
      notes: "Updated after sending",
    });
  });
});

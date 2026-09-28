import { describe, expect, it } from "vitest";
import { api, createLocation } from "./helpers.js";

describe("Locations API", () => {
  it("creates and retrieves a location with a generated warehouse code", async () => {
    const location = await createLocation({ locationType: "WAREHOUSE" });

    expect(location.locationCode).toMatch(/^WH-\d{3}$/);

    const auditResponse = await api.get("/api/v1/audit-logs").query({ action: "LOCATION_CREATED" });
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: location.id,
        action: "LOCATION_CREATED",
        details: expect.objectContaining({ after: expect.objectContaining({ id: location.id }) }),
      }),
    ]));

    const response = await api.get(`/api/v1/locations/${location.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: location.id,
      locationCode: location.locationCode,
      locationType: "WAREHOUSE",
      status: "ACTIVE",
    });
  });

  it("generates store codes with the ST prefix", async () => {
    const location = await createLocation({ locationType: "STORE" });

    expect(location.locationCode).toMatch(/^ST-\d{3}$/);
  });

  it("generates different codes for different locations", async () => {
    const first = await createLocation({
      locationType: "WAREHOUSE",
    });

    const second = await createLocation({
      locationType: "WAREHOUSE",
    });

    expect(first.locationCode).not.toBe(second.locationCode);
  });

  it("filters, updates, deactivates, and reactivates a location", async () => {
    const location = await createLocation({ name: "North Warehouse" });

    const listResponse = await api
      .get("/api/v1/locations")
      .query({ search: "North" });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);

    const updateResponse = await api
      .patch(`/api/v1/locations/${location.id}`)
      .send({ name: "Updated Warehouse" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      name: "Updated Warehouse",
      locationType: "WAREHOUSE",
      locationCode: location.locationCode,
    });

    expect(
      (await api.patch(`/api/v1/locations/${location.id}/deactivate`)).body
        .status,
    ).toBe("INACTIVE");

    expect(
      (await api.patch(`/api/v1/locations/${location.id}/reactivate`)).body
        .status,
    ).toBe("ACTIVE");
  });


  it("lists audit events with pagination and filters", async () => {
    const first = await createLocation({ name: "Audit Warehouse One" });
    const second = await createLocation({ name: "Audit Warehouse Two" });

    const response = await api.get("/api/v1/audit-logs").query({
      page: 1,
      limit: 1,
      action: "LOCATION_CREATED",
    });

    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(response.body.data).toHaveLength(1);
    expect([first.id, second.id]).toContain(response.body.data[0].locationId);
  });

  it("rejects invalid audit filters", async () => {
    const response = await api.get("/api/v1/audit-logs").query({ limit: 101 });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Invalid audit query");

    const dateRangeResponse = await api.get("/api/v1/audit-logs").query({
      from: "2026-09-30T00:00:00.000Z",
      to: "2026-09-01T23:59:59.999Z",
    });
    expect(dateRangeResponse.status).toBe(400);
    expect(dateRangeResponse.body.error.message).toBe("Invalid audit query");
  });

  it("rejects an invalid location type", async () => {
    const response = await api.post("/api/v1/locations").send({
      name: "Invalid",
      locationType: "OFFICE",
    });

    expect(response.status).toBe(400);
  });

  it("returns 405 for unsupported methods on known routes", async () => {
    const response = await api.delete("/api/v1/locations");

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Method not allowed",
      },
    });
  });

  it("returns 404 for a valid but nonexistent location", async () => {
    const response = await api.get(
      "/api/v1/locations/00000000-0000-4000-8000-000000000000",
    );

    expect(response.status).toBe(404);
  });
});

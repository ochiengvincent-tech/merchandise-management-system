import { describe, expect, it } from "vitest";
import { api, createLocation } from "./helpers.js";

describe("Locations API", () => {
  it("creates and retrieves a location with a generated warehouse code", async () => {
    const location = await createLocation({ locationType: "WAREHOUSE" });

    expect(location.locationCode).toMatch(/^WH-\d{3}$/);

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

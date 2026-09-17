import { describe, expect, it } from "vitest";
import { api, createLocation } from "./helpers.js";

describe("Locations API", () => {
  it("creates and retrieves a location", async () => {
    const location = await createLocation({ locationType: "STORE" });

    const response = await api.get(`/locations/${location.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: location.id,
      locationType: "STORE",
      status: "ACTIVE",
    });
  });

  it("filters, updates, deactivates, and reactivates a location", async () => {
    const location = await createLocation({ name: "North Warehouse" });

    const listResponse = await api.get("/locations").query({ search: "North" });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);

    const updateResponse = await api
      .patch(`/locations/${location.id}`)
      .send({ name: "Updated Warehouse", locationType: "STORE" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      name: "Updated Warehouse",
      locationType: "STORE",
    });

    expect(
      (await api.patch(`/locations/${location.id}/deactivate`)).body.status,
    ).toBe("INACTIVE");
    expect(
      (await api.patch(`/locations/${location.id}/reactivate`)).body.status,
    ).toBe("ACTIVE");
  });

  it("rejects an invalid location type", async () => {
    const response = await api.post("/locations").send({
      locationCode: "INVALID",
      name: "Invalid",
      locationType: "OFFICE",
    });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate location codes", async () => {
    const location = await createLocation();

    const response = await api.post("/locations").send({
      locationCode: location.locationCode,
      name: "Duplicate Warehouse",
      locationType: "WAREHOUSE",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      message: "Validation failed",
    });
    expect(response.body.error.details).toContainEqual({
      field: "locationCode",
      message: "Location code already exists",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { listVendorAuditLogs } = vi.hoisted(() => ({ listVendorAuditLogs: vi.fn() }));
vi.mock("../src/modules/audit/audit-list-repository.js", () => ({
  listVendorAuditLogs,
}));

import { listVendorAuditLogsController } from "../src/modules/audit/audit-list-controller.js";

function createResponse() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

describe("Vendor Management audit query controller", () => {
  beforeEach(() => listVendorAuditLogs.mockReset());

  it("passes pagination and supported filters to the audit query", async () => {
    const result = { data: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 0 } };
    listVendorAuditLogs.mockResolvedValue(result);
    const response = createResponse();
    const request = { query: {
      page: "2",
      limit: "10",
      action: "VENDOR_UPDATED",
      actorId: "33333333-3333-4333-8333-333333333333",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z",
    } } as unknown as Request;

    await listVendorAuditLogsController(request, response as unknown as Response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(result);
    expect(listVendorAuditLogs).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      action: "VENDOR_UPDATED",
      actorId: "33333333-3333-4333-8333-333333333333",
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-30T23:59:59.999Z"),
    });
  });

  it("rejects invalid pagination filters without querying the repository", async () => {
    const response = createResponse();
    const request = { query: { page: "0", limit: "101" } } as unknown as Request;

    await expect(
      listVendorAuditLogsController(request, response as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid audit query" });
    expect(listVendorAuditLogs).not.toHaveBeenCalled();
  });
  it("rejects a date range whose start is after its end", async () => {
    const response = createResponse();
    const request = { query: {
      from: "2026-09-30T00:00:00.000Z",
      to: "2026-09-01T23:59:59.999Z",
    } } as unknown as Request;

    await expect(
      listVendorAuditLogsController(request, response as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid audit query" });
    expect(listVendorAuditLogs).not.toHaveBeenCalled();
  });

});

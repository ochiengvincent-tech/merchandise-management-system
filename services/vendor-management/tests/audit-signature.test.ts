import { beforeEach, describe, expect, it } from "vitest";

import {
  createAuditSignature,
  verifyAuditSignature,
} from "../src/modules/audit/audit-signature.js";

const auditData = {
  vendorId: "8031547a-4764-42c5-ba00-7cc1607ef37c",
  action: "VENDOR_UPDATED",
  actorId: "33333333-3333-4333-8333-333333333333",
  beforeState: { name: "Before", status: "ACTIVE" },
  afterState: { status: "ACTIVE", name: "After" },
  createdAt: new Date("2026-09-23T00:00:00.000Z"),
};

describe("audit signatures", () => {
  beforeEach(() => {
    process.env.AUDIT_SIGNATURE_SECRET = "test-audit-secret";
  });

  it("creates deterministic signatures regardless of object key order", () => {
    const signature = createAuditSignature(auditData);

    expect(signature).toBe(
      createAuditSignature({
        ...auditData,
        beforeState: { status: "ACTIVE", name: "Before" },
        afterState: { name: "After", status: "ACTIVE" },
      }),
    );
  });

  it("verifies an unchanged audit record and rejects tampering", () => {
    const signature = createAuditSignature(auditData);

    expect(verifyAuditSignature(auditData, signature)).toBe(true);
    expect(
      verifyAuditSignature(
        { ...auditData, afterState: { name: "Tampered" } },
        signature,
      ),
    ).toBe(false);
  });
});

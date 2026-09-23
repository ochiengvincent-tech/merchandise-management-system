import { createHmac, timingSafeEqual } from "node:crypto";

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObject((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

export function createAuditSignature(data: {
  vendorId?: string | undefined;
  vendorProductId?: string | undefined;
  action: string;
  actorId: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  createdAt: Date;
}) {
  const secret = process.env.AUDIT_SIGNATURE_SECRET;

  if (!secret) {
    throw new Error("AUDIT_SIGNATURE_SECRET is not configured");
  }

  const payload = JSON.stringify(
    sortObject({
      vendorId: data.vendorId ?? null,
      vendorProductId: data.vendorProductId ?? null,
      action: data.action,
      actorId: data.actorId,
      beforeState: data.beforeState ?? null,
      afterState: data.afterState ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt: data.createdAt.toISOString(),
    }),
  );

  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyAuditSignature(
  data: Parameters<typeof createAuditSignature>[0],
  signature: string,
) {
  const expectedSignature = createAuditSignature(data);
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}

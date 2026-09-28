import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import { createAuditLogService } from "../audit/audit.service.js";
import {
  getVendorReliability,
  getVendorReliabilitySummaries,
} from "../reliability/vendor-reliability.repository.js";
import {
  findVendorByCode,
  findVendorById,
  listVendors,
  updateVendorWithDatabase,
  createVendorWithDatabase,
  updateVendorStatusWithDatabase,
} from "./vendor.repository.js";
export async function createVendorService(
  data: {
    vendorCode: string;
    name: string;
    email?: string | undefined;
    phone?: string | undefined;
    address?: string | undefined;
    paymentTerms?: string | undefined;
  },
  actorId: string,
) {
  const existingVendor = await findVendorByCode(data.vendorCode);

  if (existingVendor) {
    throw new AppError("Vendor code already exists", 409);
  }

  return db.transaction(async (tx) => {
    const vendor = await createVendorWithDatabase(data, tx);

    if (!vendor) {
      throw new Error("Failed to create vendor");
    }

    await createAuditLogService(
      {
        vendorId: vendor.id,
        action: "VENDOR_CREATED",
        actorId,
        beforeState: null,
        afterState: vendor,
      },
      tx,
    );

    return vendor;
  });
}

export async function getVendorByIdService(id: string) {
  const vendor = await findVendorById(id);
  if (!vendor) return null;
  const reliability = await getVendorReliability(id);
  return { ...vendor, reliabilitySummary: reliability.summary };
}

export async function getVendorsService({
  page = 1,
  limit = 20,
  status,
  search,
}: {
  page?: number;
  limit?: number;
  status?: string | undefined;
  search?: string | undefined;
}) {
  const result = await listVendors({ page, limit, status, search });
  const summaries = await getVendorReliabilitySummaries(
    result.data.map((vendor) => vendor.id),
  );
  const summaryByVendorId = new Map(summaries.map((summary) => [summary.vendorId, summary]));
  return {
    ...result,
    data: result.data.map((vendor) => {
      const summary = summaryByVendorId.get(vendor.id);
      return {
        ...vendor,
        reliabilitySummary: summary
          ? {
              ...summary,
              score: summary.eligiblePurchaseOrders >= 3 ? summary.score : null,
              minimumEligiblePurchaseOrders: 3,
            }
          : null,
      };
    }),
  };
}

export async function updateVendorService(
  id: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    paymentTerms?: string | undefined;
  },
  actorId: string,
) {
  const existingVendor = await findVendorById(id);
  if (!existingVendor) {
    return null;
  }
  return db.transaction(async (tx) => {
    const vendor = await updateVendorWithDatabase(id, data, tx);
    if (!vendor) {
      throw new Error("Failed to update vendor");
    }
    await createAuditLogService(
      {
        vendorId: vendor.id,
        action: "VENDOR_UPDATED",
        actorId,
        beforeState: existingVendor,
        afterState: vendor,
      },
      tx,
    );
    return vendor;
  });
}

export async function deactivateVendorService(id: string, actorId: string) {
  const existingVendor = await findVendorById(id);
  if (!existingVendor) {
    return null;
  }
  if (existingVendor.status === "INACTIVE") {
    throw new AppError("Vendor is already inactive", 409);
  }
  return db.transaction(async (tx) => {
    const vendor = await updateVendorStatusWithDatabase(id, "INACTIVE", tx);
    if (!vendor) {
      throw new Error("Failed to deactivate vendor");
    }
    await createAuditLogService(
      {
        vendorId: vendor.id,
        action: "VENDOR_DEACTIVATED",
        actorId,
        beforeState: existingVendor,
        afterState: vendor,
      },
      tx,
    );
    return vendor;
  });
}

export async function reactivateVendorService(id: string, actorId: string) {
  const existingVendor = await findVendorById(id);
  if (!existingVendor) {
    return null;
  }
  if (existingVendor.status === "ACTIVE") {
    throw new AppError("Vendor is already active", 409);
  }
  return db.transaction(async (tx) => {
    const vendor = await updateVendorStatusWithDatabase(id, "ACTIVE", tx);
    if (!vendor) {
      throw new Error("Failed to reactivate vendor");
    }
    await createAuditLogService(
      {
        vendorId: vendor.id,
        action: "VENDOR_REACTIVATED",
        actorId,
        beforeState: existingVendor,
        afterState: vendor,
      },
      tx,
    );
    return vendor;
  });
}

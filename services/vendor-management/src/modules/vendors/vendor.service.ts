import { db } from "../../db/index.js";
import { createAuditLogService } from "../audit/audit.service.js";
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
    throw new Error("Vendor code already exists");
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
  return findVendorById(id);
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
  return listVendors({
    page,
    limit,
    status,
    search,
  });
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
    throw new Error("Vendor is already inactive");
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
    throw new Error("Vendor is already active");
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

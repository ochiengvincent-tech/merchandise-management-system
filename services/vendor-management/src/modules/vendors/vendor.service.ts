import {
  createVendor,
  findVendorByCode,
  findVendorById,
  listVendors,
  updateVendor,
  updateVendorStatus
} from "./vendor.repository.js";

export async function createVendorService(data: {
  vendorCode: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}) {
  const existingVendor = await findVendorByCode(data.vendorCode);

  if (existingVendor) {
    throw new Error("Vendor code already exists");
  }

  return createVendor(data);
}

export async function getVendorByIdService(id: string) {
  return findVendorById(id);
}

export async function getVendorsService({
  page = 1,
  limit = 20,
  status,
  search
}: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  return listVendors({
    page,
    limit,
    status,
    search
  });
}

export async function updateVendorService(
  id: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
) {
  const existingVendor = await findVendorById(id);

  if (!existingVendor) {
    return null;
  }

  return updateVendor(id, data);
}
export async function deactivateVendorService(id: string) {
  const existingVendor = await findVendorById(id);

  if (!existingVendor) {
    return null;
  }

  if (existingVendor.status === "INACTIVE") {
    throw new Error("Vendor is already inactive");
  }

  return updateVendorStatus(id, "INACTIVE");
}

export async function reactivateVendorService(id: string) {
  const existingVendor = await findVendorById(id);

  if (!existingVendor) {
    return null;
  }

  if (existingVendor.status === "ACTIVE") {
    throw new Error("Vendor is already active");
  }

  return updateVendorStatus(id, "ACTIVE");
}

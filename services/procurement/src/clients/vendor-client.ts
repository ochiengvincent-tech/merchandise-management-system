import { env } from "../config/env.js";

export class VendorServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "VendorServiceError";
  }
}

const REQUEST_TIMEOUT_MS = 5_000;

type Vendor = {
  id: string;
  vendorCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  status: string;
};

type VendorProduct = {
  id: string;
  vendorId: string;
  productId: string;
  supplierProductCode: string | null;
  currentPrice: string;
  leadTimeDays: number;
  status: string;
};

type VendorResponse = {
  data: Vendor;
};

type VendorProductsResponse = {
  data: VendorProduct[];
};

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(
      new URL(
        path.replace(/^\/+/, ""),
        `${env.VENDOR_SERVICE_URL}/`,
      ),
      { signal: controller.signal },
    );
  } catch {
    throw new VendorServiceError("Vendor service is unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new VendorServiceError(
      `Vendor service request failed with status ${response.status}`,
      response.status === 404 ? 404 : 503,
    );
  }

  return (await response.json()) as T;
}

export async function getVendorById(id: string) {
  const response = await request<VendorResponse>(
    `/vendors/${id}`,
  );

  return response.data;
}

export async function getVendorProducts(vendorId: string) {
  const response = await request<VendorProductsResponse>(
    `/vendors/${vendorId}/products`,
  );

  return response.data;
}

export type { Vendor, VendorProduct };

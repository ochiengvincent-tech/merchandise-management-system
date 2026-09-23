import { vi } from "vitest";

const vendorId = "8031547a-4764-42c5-ba00-7cc1607ef37c";
const productId = "22cd0a2c-f1b4-4cd0-9fe5-d166b7cd21af";
const locationId = "4ff44601-df27-4b6d-97f0-900e60f8a6d9";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;

    if (path === `/api/v1/vendors/${vendorId}`) {
      return jsonResponse({
        data: {
          id: vendorId,
          vendorCode: "VENDOR-TEST",
          name: "Test Vendor",
          email: null,
          phone: null,
          address: null,
          paymentTerms: "NET 30",
          status: "ACTIVE",
        },
      });
    }

    if (path === `/api/v1/vendors/${vendorId}/products`) {
      return jsonResponse({
        data: [
          {
            id: "904d4c6c-0cc4-4d7c-bf4d-a0e5c2df4f6f",
            vendorId,
            productId,
            supplierProductCode: null,
            currentPrice: "3500.00",
            leadTimeDays: 7,
            status: "ACTIVE",
          },
          {
            id: "904d4c6c-0cc4-4d7c-bf4d-a0e5c2df4f70",
            vendorId,
            productId: "650e8400-e29b-41d4-a716-446655440000",
            supplierProductCode: null,
            currentPrice: "3500.00",
            leadTimeDays: 7,
            status: "ACTIVE",
          },
        ],
      });
    }

    if (path === `/api/v1/vendors/99999999-9999-4999-8999-999999999999`) {
      return jsonResponse({ error: { message: "Vendor not found" } }, 404);
    }

    if (path === `/api/v1/locations/${locationId}`) {
      return jsonResponse({
        id: locationId,
        status: "ACTIVE",
      });
    }

    if (path === "/api/v1/locations/99999999-9999-4999-8999-999999999999") {
      return jsonResponse({ error: { message: "Location not found" } }, 404);
    }

    if (path === `/api/v1/products/${productId}`) {
      return jsonResponse({
        id: productId,
        status: "ACTIVE",
      });
    }

    if (path === "/api/v1/products/650e8400-e29b-41d4-a716-446655440000") {
      return jsonResponse({ error: { message: "Product not found" } }, 404);
    }

    return jsonResponse({ error: { message: "Not found" } }, 404);
  }),
);

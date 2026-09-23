import { env } from "../config/env.js";

export class InventoryServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

const REQUEST_TIMEOUT_MS = 5_000;

type Product = {
  id: string;
  status: string;
};

type Location = {
  id: string;
  status: string;
};

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(
      new URL(
        path.replace(/^\/+/, ""),
        `${env.INVENTORY_SERVICE_URL}/`,
      ),
      { signal: controller.signal },
    );
  } catch {
    throw new InventoryServiceError(
      "Inventory service is unavailable",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new InventoryServiceError(
      `Inventory service request failed with status ${response.status}`,
      response.status === 404 ? 404 : 503,
    );
  }

  return (await response.json()) as T;
}

export function getProductById(id: string) {
  return request<Product>(`/products/${id}`);
}

export function getLocationById(id: string) {
  return request<Location>(`/locations/${id}`);
}

export type { Location, Product };

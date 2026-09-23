import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const REQUEST_TIMEOUT_MS = 5_000;

type Product = {
  id: string;
  status: string;
};

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(
      new URL(path.replace(/^\/+/, ""), `${env.INVENTORY_SERVICE_URL}/`),
      { signal: controller.signal },
    );
  } catch {
    throw new AppError("Inventory service is unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `Inventory service returned ${response.status}`;

    try {
      const body = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      message = body.error?.message ?? message;
    } catch {}

    throw new AppError(message, response.status);
  }

  return (await response.json()) as T;
}

export const getProductById = (id: string) =>
  request<Product>(`/products/${id}`);

export type { Product };

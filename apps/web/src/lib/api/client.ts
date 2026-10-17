import { getCsrfToken } from "../auth/session";

export type ApiFieldError = {
  field: string;
  message: string;
};

type ApiErrorDetail = {
  field?: unknown;
  message?: unknown;
};

type ApiErrorBody = {
  error?: {
    message?: unknown;
    details?: unknown;
  };
  message?: unknown;
};

export function getFieldErrorMap(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  return Object.fromEntries(
    error.fieldErrors.map(({ field, message }) => [field, message]),
  );
}
export class ApiError extends Error {
  fieldErrors: ApiFieldError[];

  constructor(message: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
  }
}

export async function apiRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const method = options?.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/json");
  if (options?.body !== undefined) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (!csrfToken) throw new ApiError("Your session security token is missing. Reload the page and try again.");
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) window.location.assign("/auth/login");
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;

    const details: ApiFieldError[] = Array.isArray(body?.error?.details)
      ? body.error.details.flatMap((detail: unknown) => {
          if (typeof detail !== "object" || detail === null) return [];

          const { field, message } = detail as ApiErrorDetail;
          if (typeof field !== "string" || field.length === 0) return [];

          return [{
            field,
            message: typeof message === "string" ? message : "Invalid value",
          }];
        })
      : [];

    throw new ApiError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : typeof body?.message === "string"
          ? body.message
          : `Request failed with status ${response.status}`,
      details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

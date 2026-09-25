export type ApiFieldError = {
  field: string;
  message: string;
};

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
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
  const body = await response.json().catch(() => null);

  console.log("API ERROR RESPONSE:", body);

  const details = Array.isArray(body?.error?.details)
    ? body.error.details
        .filter(
          (detail: unknown): detail is { path?: unknown; message?: unknown } =>
            typeof detail === "object" && detail !== null,
        )
        .map((detail: { path?: unknown; message?: unknown }) => ({
          field: Array.isArray(detail.path)
            ? detail.path
                .filter((part): part is string => typeof part === "string")
                .join(".")
            : "",
          message:
            typeof detail.message === "string"
              ? detail.message
              : "Invalid value",
        }))
        .filter((detail: { field: string; message: string }) => detail.field)
    : [];

  throw new ApiError(
    body?.error?.message ||
      body?.message ||
      `Request failed with status ${response.status}`,
    details,
  );
}
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
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
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
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

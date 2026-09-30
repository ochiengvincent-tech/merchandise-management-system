export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
    readonly details: Array<{ field?: string; message: string }> = [],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type AppErrorDetail = { field?: string; message: string };

export class AppError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details: AppErrorDetail[] = []) {
    super(message);
    this.name = "AppError";
  }
}

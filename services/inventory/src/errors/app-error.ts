export type AppErrorDetail = {
  field?: string;
  message: string;
};

export class AppError extends Error {
  statusCode: number;
  details: AppErrorDetail[];

  constructor(
    message: string,
    statusCode = 400,
    details: AppErrorDetail[] = []
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
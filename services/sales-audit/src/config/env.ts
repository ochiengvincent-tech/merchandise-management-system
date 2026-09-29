import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Create services/sales-audit/.env from " +
      "services/sales-audit/.env.example, then start the service again.",
  );
}

export const env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3007),
  RETAIL_SALES_API_URL: z.url().default("http://localhost:3006/api/v1"),
  RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
  RABBITMQ_QUEUE_PREFIX: z.string().default(""),
}).parse(process.env);

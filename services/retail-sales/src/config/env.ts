import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });
export const env = z.object({
  DATABASE_URL: z.url(), PORT: z.coerce.number().int().positive().default(3006),
  INVENTORY_API_URL: z.url().default("http://localhost:3002/api/v1"),
  RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
  RABBITMQ_QUEUE_PREFIX: z.string().default(""),
}).parse(process.env);

import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Create services/financials/.env from services/financials/.env.example.");
}

const flags = z.enum(["true", "false"]).default("false");
const parsed = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3008),
  FINANCIALS_POSTING_ENABLED: flags,
  RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
  RABBITMQ_QUEUE_PREFIX: z.string().default(""),
  PROCUREMENT_API_URL: z.url().default("http://localhost:3003"),
  RECEIVING_API_URL: z.url().default("http://localhost:3004"),
}).parse(process.env);

export const env = {
  ...parsed,
  postingEnabled: parsed.FINANCIALS_POSTING_ENABLED === "true",
};

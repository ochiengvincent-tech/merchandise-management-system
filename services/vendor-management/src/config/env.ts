import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  INVENTORY_SERVICE_URL: z.url().default("http://localhost:3002/api/v1"),
  RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
  RABBITMQ_QUEUE_PREFIX: z.string().default(""),
});

export const env = envSchema.parse(process.env);

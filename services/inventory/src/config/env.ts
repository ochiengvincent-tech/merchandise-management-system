import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3002),
  RABBITMQ_URL: z.string().url().default("amqp://localhost:5672")
});

export const env = envSchema.parse(process.env);
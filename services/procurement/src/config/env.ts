import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3003),
  RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
});

export const env = envSchema.parse(process.env);
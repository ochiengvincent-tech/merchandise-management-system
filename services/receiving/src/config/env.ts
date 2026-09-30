import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3004),
    PROCUREMENT_API_URL: z.url().default("http://localhost:3003/api/v1"),
    INVENTORY_API_URL: z.url().default("http://localhost:3002/api/v1"),
    RABBITMQ_URL: z.url().default("amqp://localhost:5672"),
  })
  .parse(process.env);

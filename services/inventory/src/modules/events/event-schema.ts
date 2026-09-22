import { z } from "zod";

export const processedEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(100)
});
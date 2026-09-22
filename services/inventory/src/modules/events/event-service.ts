import {
  createProcessedEvent,
  findProcessedEvent
} from "./event-repository.js";

export const isEventProcessed = async (eventId: string) => {
  const event = await findProcessedEvent(eventId);

  return event !== null;
};

export const markEventAsProcessed = async (
  eventId: string,
  eventType: string,
  database: Parameters<typeof createProcessedEvent>[1]
) => {
  return createProcessedEvent(
    {
      eventId,
      eventType
    },
    database
  );
};
import { createOutboxEvent } from "./outbox-repository.js";

export const createStockLowEvent = async (
  previousStock: {
    quantityOnHand: number;
    quantityAllocated: number;
  },
  currentStock: {
    productId: string;
    locationId: string;
    quantityOnHand: number;
    quantityAllocated: number;
  },
  reorderLevel: number,
  database: Parameters<typeof createOutboxEvent>[1],
) => {
  const previousQuantityAvailable =
    previousStock.quantityOnHand - previousStock.quantityAllocated;

  const quantityAvailable =
    currentStock.quantityOnHand - currentStock.quantityAllocated;

  const crossedIntoLowStock =
    previousQuantityAvailable > reorderLevel &&
    quantityAvailable <= reorderLevel;

  if (!crossedIntoLowStock) {
    return null;
  }

  const eventId = crypto.randomUUID();

  return createOutboxEvent(
    {
      eventId,
      eventType: "StockLow",
      aggregateType: "PRODUCT",
      aggregateId: currentStock.productId,
      payload: {
        eventId,
        eventType: "StockLow",
        productId: currentStock.productId,
        locationId: currentStock.locationId,
        quantityOnHand: currentStock.quantityOnHand,
        quantityAllocated: currentStock.quantityAllocated,
        quantityAvailable,
        reorderLevel,
      },
    },
    database,
  );
};

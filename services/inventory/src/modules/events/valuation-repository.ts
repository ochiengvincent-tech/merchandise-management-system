import { randomUUID } from "node:crypto";
import type { db } from "../../db/index.js";
import { inventoryOutboxEvents } from "../../db/schema/inventory-outbox-events.js";

type Database = Pick<typeof db, "insert">;

export async function recordValuationChange(
  database: Database,
  input: {
    stockId: string;
    sourceType: "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT";
    sourceId: string;
    sourceEventId: string;
    productId: string;
    locationId: string;
    quantityDelta: number;
    carryingValueDeltaMinor: bigint;
    reason:
      | "RECEIPT"
      | "SALE_CONSUMPTION"
      | "RETURN_RESTOCK"
      | "WRITE_OFF"
      | "ADJUSTMENT_GAIN"
      | "ADJUSTMENT_LOSS";
    currency?: string;
    costPolicyVersion?: string;
  },
) {
  await database.insert(inventoryOutboxEvents).values({
    eventId: randomUUID(),
    eventType: "InventoryValuationChanged",
    aggregateType: "InventoryStock",
    aggregateId: input.stockId,
    payload: {
      schemaVersion: 1,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceEventId: input.sourceEventId,
      productId: input.productId,
      locationId: input.locationId,
      currency: input.currency ?? "KES",
      quantityDelta: input.quantityDelta,
      carryingValueDeltaMinor: input.carryingValueDeltaMinor.toString(),
      costPolicyVersion:
        input.costPolicyVersion ?? "moving-weighted-average-v1",
      reason: input.reason,
    },
  });
}

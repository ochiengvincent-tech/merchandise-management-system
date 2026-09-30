import { randomUUID } from "node:crypto";
import type { db } from "../../db/index.js";
import { inventoryOutboxEvents } from "../../db/schema/inventory-outbox-events.js";

type Database = Pick<typeof db, "insert">;
export function moneyToMinor(amount: string | number) {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Inventory unit cost is invalid");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

const UNIT_COST_SCALE = 1_000_000n;

export function unitCostFromCarryingValue(carryingValueMinor: bigint | string, quantity: number) {
  if (quantity <= 0) return "0.000000";
  const scaled = (BigInt(carryingValueMinor) * 10_000n + BigInt(quantity) / 2n) / BigInt(quantity);
  const whole = scaled / UNIT_COST_SCALE;
  const fraction = String(scaled % UNIT_COST_SCALE).padStart(6, "0");
  return `${whole}.${fraction}`;
}

export function valueAtAverage(carryingValueMinor: bigint | string, quantity: number, currentQuantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(currentQuantity) || currentQuantity < 0) {
    throw new Error("Inventory average-cost quantity is invalid");
  }
  if (quantity === 0 || currentQuantity === 0) return 0n;
  return (BigInt(carryingValueMinor) * BigInt(quantity) + BigInt(currentQuantity) / 2n) / BigInt(currentQuantity);
}

export function allocateCarryingValue(carryingValueMinor: bigint | string, quantity: number, totalQuantity: number) {
  if (!Number.isInteger(quantity) || !Number.isInteger(totalQuantity) || quantity < 0 || totalQuantity < quantity || totalQuantity <= 0) {
    throw new Error("Inventory carrying value allocation quantity is invalid");
  }
  const carryingValue = BigInt(carryingValueMinor);
  if (quantity === totalQuantity) return carryingValue;
  return (carryingValue * BigInt(quantity) + BigInt(totalQuantity) / 2n) / BigInt(totalQuantity);
}

export async function recordValuationChange(database: Database, input: {
  stockId: string;
  sourceType: "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT";
  sourceId: string;
  sourceEventId: string;
  productId: string;
  locationId: string;
  quantityDelta: number;
  carryingValueDeltaMinor: bigint;
  reason: "RECEIPT" | "SALE_CONSUMPTION" | "RETURN_RESTOCK" | "WRITE_OFF" | "ADJUSTMENT_GAIN" | "ADJUSTMENT_LOSS";
  currency?: string;
  costPolicyVersion?: string;
}) {
  await database.insert(inventoryOutboxEvents).values({
    eventId: randomUUID(), eventType: "InventoryValuationChanged", aggregateType: "InventoryStock", aggregateId: input.stockId,
    payload: { schemaVersion: 1, sourceType: input.sourceType, sourceId: input.sourceId, sourceEventId: input.sourceEventId, productId: input.productId, locationId: input.locationId, currency: input.currency ?? "KES", quantityDelta: input.quantityDelta, carryingValueDeltaMinor: input.carryingValueDeltaMinor.toString(), costPolicyVersion: input.costPolicyVersion ?? "moving-weighted-average-v1", reason: input.reason },
  });
}

import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryProcessedEvents } from "../../db/schema/inventory-processed-events.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { inventorySaleCosts } from "../../db/schema/inventory-sale-costs.js";
import { AppError } from "../../errors/app-error.js";
import { allocateCarryingValue, recordValuationChange, unitCostFromCarryingValue } from "../events/valuation-outbox.js";

export async function consumeSaleReturnedEvent(input: {
  eventId: string; returnId: string; saleId: string; actorId: string; locationId: string;
  lines: Array<{ productId: string; quantity: number; disposition: "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN" }>;
}) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(inventoryProcessedEvents).values({ eventId: input.eventId, eventType: "SaleReturned" }).onConflictDoNothing({ target: inventoryProcessedEvents.eventId }).returning();
    if (!inserted) return;
    for (const line of input.lines) {
      if (line.disposition !== "RESTOCK_SELLABLE") continue;
      const [costRecord] = await tx.select().from(inventorySaleCosts).where(and(eq(inventorySaleCosts.saleId, input.saleId), eq(inventorySaleCosts.productId, line.productId), eq(inventorySaleCosts.locationId, input.locationId))).for("update").limit(1);
      if (costRecord && costRecord.returnedQuantity + line.quantity > costRecord.originalQuantity) throw new AppError("Returned quantity exceeds the original Inventory cost snapshot", 409);
      const [currentStock] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.productId, line.productId), eq(inventoryStock.locationId, input.locationId))).for("update").limit(1);
      if (!currentStock) throw new AppError("Cannot restock a returned product without an Inventory stock record", 409);
      const oldValueMinor = BigInt(currentStock.carryingValueMinor);
      const newQuantityOnHand = currentStock.quantityOnHand + line.quantity;
      let returnCostMinor: bigint;
      let usedFallbackCost = false;
      if (costRecord) {
        const denominator = BigInt(costRecord.originalQuantity);
        const oldReturnedCost = (costRecord.originalCostMinor * BigInt(costRecord.returnedQuantity) + denominator / 2n) / denominator;
        const newReturnedQuantity = costRecord.returnedQuantity + line.quantity;
        const newReturnedCost = (costRecord.originalCostMinor * BigInt(newReturnedQuantity) + denominator / 2n) / denominator;
        returnCostMinor = newReturnedCost - oldReturnedCost;
        await tx.update(inventorySaleCosts).set({ returnedQuantity: newReturnedQuantity }).where(eq(inventorySaleCosts.id, costRecord.id));
      } else {
        returnCostMinor = currentStock.quantityOnHand > 0 ? allocateCarryingValue(oldValueMinor, line.quantity, currentStock.quantityOnHand) : 0n;
        usedFallbackCost = true;
      }
      const newCarryingValueMinor = oldValueMinor + returnCostMinor;
      const [stock] = await tx.update(inventoryStock).set({ quantityOnHand: newQuantityOnHand, carryingValueMinor: newCarryingValueMinor.toString(), unitCost: unitCostFromCarryingValue(newCarryingValueMinor, newQuantityOnHand), updatedAt: new Date() }).where(eq(inventoryStock.id, currentStock.id)).returning();
      if (!stock) throw new AppError("Cannot update Inventory valuation for this return", 409);
      const carryingValueDeltaMinor = returnCostMinor;
      await recordValuationChange(tx, {
        stockId: currentStock.id, sourceType: "RETURN", sourceId: input.returnId, sourceEventId: input.eventId,
        productId: line.productId, locationId: input.locationId, quantityDelta: line.quantity,
        carryingValueDeltaMinor, reason: "RETURN_RESTOCK",
        ...(usedFallbackCost ? { costPolicyVersion: "fallback-current-average-review-v1" } : {}),
      });
      await tx.insert(inventoryAuditLogs).values({ productId: line.productId, locationId: input.locationId, action: "SALE_RETURN_RESTOCKED", actorId: input.actorId, details: { returnId: input.returnId, saleId: input.saleId, quantity: line.quantity, eventId: input.eventId, costSnapshotAvailable: Boolean(costRecord) } });
    }
  });
}

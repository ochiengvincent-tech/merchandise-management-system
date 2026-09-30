import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryProcessedEvents } from "../../db/schema/inventory-processed-events.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";

export async function consumeSaleReturnedEvent(input: {
  eventId: string; returnId: string; saleId: string; actorId: string; locationId: string;
  lines: Array<{ productId: string; quantity: number; disposition: "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN" }>;
}) {
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(inventoryProcessedEvents).values({ eventId: input.eventId, eventType: "SaleReturned" }).onConflictDoNothing({ target: inventoryProcessedEvents.eventId }).returning();
    if (!inserted) return;
    for (const line of input.lines) {
      if (line.disposition !== "RESTOCK_SELLABLE") continue;
      const [stock] = await tx.update(inventoryStock).set({ quantityOnHand: sql`${inventoryStock.quantityOnHand} + ${line.quantity}`, updatedAt: new Date() }).where(and(eq(inventoryStock.productId, line.productId), eq(inventoryStock.locationId, input.locationId))).returning();
      if (!stock) throw new AppError("Cannot restock a returned product without an Inventory stock record", 409);
      await tx.insert(inventoryAuditLogs).values({ productId: line.productId, locationId: input.locationId, action: "SALE_RETURN_RESTOCKED", actorId: input.actorId, details: { returnId: input.returnId, saleId: input.saleId, quantity: line.quantity, eventId: input.eventId } });
    }
  });
}

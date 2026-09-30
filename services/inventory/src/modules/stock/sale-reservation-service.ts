import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryProcessedEvents } from "../../db/schema/inventory-processed-events.js";
import { inventorySaleReservations } from "../../db/schema/inventory-sale-reservations.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { inventorySaleCosts } from "../../db/schema/inventory-sale-costs.js";
import { AppError } from "../../errors/app-error.js";
import { allocateCarryingValue, recordValuationChange, unitCostFromCarryingValue } from "../events/valuation-outbox.js";
import { findLocationById } from "../locations/location-repository.js";
import { findProductById } from "../products/product-repository.js";
import { allocateStock, findStockByProductAndLocationWithDatabase } from "./stock-repository.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function reserveSaleStock(input: {
  idempotencyKey: string; reservationId: string; saleId: string; productId: string;
  locationId: string; quantity: number; actorId: string;
}) {
  const requestHash = hash({ reservationId: input.reservationId, saleId: input.saleId, productId: input.productId, locationId: input.locationId, quantity: input.quantity, actorId: input.actorId });
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existing] = await tx.select().from(inventorySaleReservations).where(eq(inventorySaleReservations.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AppError("Idempotency-Key was already used with different reservation data", 409);
      if (existing.status !== "RESERVED") throw new AppError(`This sale reservation is already ${existing.status.toLowerCase()}`, 409);
      return { reservation: existing, duplicate: true };
    }
    const [product, location] = await Promise.all([findProductById(input.productId), findLocationById(input.locationId)]);
    if (!product || product.status !== "ACTIVE") throw new AppError("Product is missing or inactive", 409, [{ field: "productId", message: "Choose an active product." }]);
    if (!location || location.status !== "ACTIVE") throw new AppError("Location is missing or inactive", 409, [{ field: "locationId", message: "Choose an active location." }]);
    const stock = await findStockByProductAndLocationWithDatabase(input.productId, input.locationId, tx);
    if (!stock) throw new AppError("No stock record exists for this product at the selected location", 409, [{ field: "productId", message: "This item is not available at this store." }]);
    const updated = await allocateStock(stock.id, input.quantity, tx);
    if (!updated) throw new AppError("Insufficient available stock", 409, [{ field: "quantity", message: "There is not enough available stock to reserve this quantity." }]);
    const [reservation] = await tx.insert(inventorySaleReservations).values({
      id: input.reservationId, idempotencyKey: input.idempotencyKey, requestHash, saleId: input.saleId,
      productId: input.productId, locationId: input.locationId, quantity: input.quantity, actorId: input.actorId,
    }).returning();
    if (!reservation) throw new Error("Sale stock reservation was not persisted");
    await tx.insert(inventoryAuditLogs).values({
      productId: input.productId, locationId: input.locationId, action: "SALE_STOCK_RESERVED", actorId: input.actorId,
      details: { reservationId: reservation.id, saleId: input.saleId, quantity: input.quantity },
    });
    return { reservation, duplicate: false };
  });
}

export async function releaseSaleStock(reservationId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(inventorySaleReservations).where(eq(inventorySaleReservations.id, reservationId)).for("update").limit(1);
    if (!reservation) throw new AppError("Sale stock reservation not found", 404);
    if (reservation.status === "RELEASED") return { reservation, duplicate: true };
    if (reservation.status === "CONSUMED") throw new AppError("Consumed sale stock cannot be released", 409);
    const [stock] = await tx.update(inventoryStock).set({
      quantityAllocated: sql`${inventoryStock.quantityAllocated} - ${reservation.quantity}`,
      updatedAt: new Date(),
    }).where(and(eq(inventoryStock.productId, reservation.productId), eq(inventoryStock.locationId, reservation.locationId), sql`${inventoryStock.quantityAllocated} >= ${reservation.quantity}`)).returning();
    if (!stock) throw new AppError("The reserved stock could not be released safely", 409);
    const [updated] = await tx.update(inventorySaleReservations).set({ status: "RELEASED", updatedAt: new Date() }).where(eq(inventorySaleReservations.id, reservationId)).returning();
    await tx.insert(inventoryAuditLogs).values({ productId: reservation.productId, locationId: reservation.locationId, action: "SALE_STOCK_RESERVATION_RELEASED", actorId, details: { reservationId, saleId: reservation.saleId, quantity: reservation.quantity } });
    return { reservation: updated, duplicate: false };
  });
}

export async function consumeSaleCompletedEvent(input: {
  eventId: string; saleId: string; actorId: string;
  lines: Array<{ reservationId: string; productId: string; locationId: string; quantity: number }>;
}) {
  await db.transaction(async (tx) => {
    const [processed] = await tx.insert(inventoryProcessedEvents).values({ eventId: input.eventId, eventType: "SaleCompleted" }).onConflictDoNothing({ target: inventoryProcessedEvents.eventId }).returning();
    if (!processed) return;
    for (const line of input.lines) {
      const [reservation] = await tx.select().from(inventorySaleReservations).where(eq(inventorySaleReservations.id, line.reservationId)).for("update").limit(1);
      if (!reservation || reservation.saleId !== input.saleId || reservation.productId !== line.productId || reservation.locationId !== line.locationId || reservation.quantity !== line.quantity) {
        throw new AppError("Sale event does not match its Inventory reservation", 409);
      }
      if (reservation.status === "CONSUMED" && reservation.consumedByEventId === input.eventId) continue;
      if (reservation.status !== "RESERVED") throw new AppError("Sale stock reservation is no longer available for consumption", 409);
      const [currentStock] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.productId, line.productId), eq(inventoryStock.locationId, line.locationId))).for("update").limit(1);
      if (!currentStock || currentStock.quantityOnHand < line.quantity || currentStock.quantityAllocated < line.quantity) throw new AppError("Reserved Inventory quantity could not be consumed safely", 409);
      const costMinor = allocateCarryingValue(currentStock.carryingValueMinor, line.quantity, currentStock.quantityOnHand);
      const newQuantityOnHand = currentStock.quantityOnHand - line.quantity;
      const newCarryingValueMinor = BigInt(currentStock.carryingValueMinor) - costMinor;
      const [stock] = await tx.update(inventoryStock).set({
        quantityOnHand: newQuantityOnHand,
        quantityAllocated: currentStock.quantityAllocated - line.quantity,
        carryingValueMinor: newCarryingValueMinor.toString(),
        unitCost: unitCostFromCarryingValue(newCarryingValueMinor, newQuantityOnHand),
        updatedAt: new Date(),
      }).where(eq(inventoryStock.id, currentStock.id)).returning();
      if (!stock) throw new AppError("Reserved Inventory quantity could not be consumed safely", 409);
      const [existingCost] = await tx.select().from(inventorySaleCosts).where(and(eq(inventorySaleCosts.saleId, input.saleId), eq(inventorySaleCosts.productId, line.productId), eq(inventorySaleCosts.locationId, line.locationId))).for("update").limit(1);
      if (existingCost) {
        await tx.update(inventorySaleCosts).set({ originalQuantity: existingCost.originalQuantity + line.quantity, originalCostMinor: existingCost.originalCostMinor + costMinor }).where(eq(inventorySaleCosts.id, existingCost.id));
      } else {
        await tx.insert(inventorySaleCosts).values({ saleId: input.saleId, productId: line.productId, locationId: line.locationId, originalQuantity: line.quantity, originalCostMinor: costMinor });
      }
      await recordValuationChange(tx, { stockId: currentStock.id, sourceType: "SALE", sourceId: input.saleId, sourceEventId: input.eventId, productId: line.productId, locationId: line.locationId, quantityDelta: -line.quantity, carryingValueDeltaMinor: -costMinor, reason: "SALE_CONSUMPTION" });
      await tx.update(inventorySaleReservations).set({ status: "CONSUMED", consumedByEventId: input.eventId, updatedAt: new Date() }).where(eq(inventorySaleReservations.id, reservation.id));
      await tx.insert(inventoryAuditLogs).values({ productId: line.productId, locationId: line.locationId, action: "SALE_STOCK_CONSUMED", actorId: input.actorId, details: { reservationId: reservation.id, saleId: input.saleId, quantity: line.quantity, eventId: input.eventId } });
    }
  });
}

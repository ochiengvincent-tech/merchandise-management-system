import { and, eq, asc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
  warehouseMovements,
  warehouseProcessedEvents,
} from "../../db/schema/warehouse.js";

export type WarehouseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export const runWarehouseTransaction = <T>(
  operation: (tx: WarehouseTransaction) => Promise<T>,
) => db.transaction(operation);

export const markWarehouseEventProcessed = async (
  tx: WarehouseTransaction,
  eventId: string,
  eventType: string,
) => {
  const [inserted] = await tx
    .insert(warehouseProcessedEvents)
    .values({ eventId, eventType })
    .onConflictDoNothing({ target: warehouseProcessedEvents.eventId })
    .returning();
  return Boolean(inserted);
};

export const findSellableBinsForProduct = (
  tx: WarehouseTransaction,
  locationId: string,
  productId: string,
) =>
  tx
    .select({ balance: warehouseBinBalances, bin: warehouseBins })
    .from(warehouseBinBalances)
    .innerJoin(warehouseBins, eq(warehouseBinBalances.binId, warehouseBins.id))
    .where(
      and(
        eq(warehouseBins.locationId, locationId),
        eq(warehouseBins.status, "ACTIVE"),
        eq(warehouseBinBalances.productId, productId),
        eq(warehouseBinBalances.disposition, "SELLABLE"),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${warehouseBins.binType} = 'PICK_FACE' THEN 0 WHEN ${warehouseBins.binType} = 'STORAGE' THEN 1 ELSE 2 END`,
      asc(warehouseBins.code),
    )
    .for("update");

export const decreaseBinBalance = (
  tx: WarehouseTransaction,
  balanceId: string,
  quantity: number,
) =>
  tx
    .update(warehouseBinBalances)
    .set({
      quantity: sql`${warehouseBinBalances.quantity} - ${quantity}`,
      updatedAt: new Date(),
    })
    .where(eq(warehouseBinBalances.id, balanceId));

export const createSaleMovement = (
  tx: WarehouseTransaction,
  data: typeof warehouseMovements.$inferInsert,
) => tx.insert(warehouseMovements).values(data).returning();

export const createWarehouseAuditLog = (
  tx: WarehouseTransaction,
  data: typeof warehouseAuditLogs.$inferInsert,
) => tx.insert(warehouseAuditLogs).values(data);

export const createReturnBinIfMissing = (
  tx: WarehouseTransaction,
  data: typeof warehouseBins.$inferInsert,
) =>
  tx
    .insert(warehouseBins)
    .values(data)
    .onConflictDoNothing({
      target: [warehouseBins.locationId, warehouseBins.code],
    });

export const findActiveReturnBin = (
  tx: WarehouseTransaction,
  locationId: string,
  code: string,
) =>
  tx
    .select()
    .from(warehouseBins)
    .where(
      and(
        eq(warehouseBins.locationId, locationId),
        eq(warehouseBins.code, code),
        eq(warehouseBins.status, "ACTIVE"),
      ),
    )
    .limit(1);

export const addReturnedBalance = (
  tx: WarehouseTransaction,
  data: {
    binId: string;
    productId: string;
    disposition: "SELLABLE" | "QUARANTINED";
    quantity: number;
  },
) =>
  tx
    .insert(warehouseBinBalances)
    .values(data)
    .onConflictDoUpdate({
      target: [
        warehouseBinBalances.binId,
        warehouseBinBalances.productId,
        warehouseBinBalances.disposition,
      ],
      set: {
        quantity: sql`${warehouseBinBalances.quantity} + ${data.quantity}`,
        updatedAt: new Date(),
      },
    });

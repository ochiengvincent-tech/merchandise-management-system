import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getInventoryStockByLocation, requireManagedWarehouseLocation } from "../../clients/inventory-client.js";
import { db } from "../../db/index.js";
import { warehouseBinBalances, warehouseBins, warehouseMovements } from "../../db/schema/warehouse.js";

const router: Router = Router();
const pageSchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

router.get("/stock", async (req, res) => {
  const query = z.object({
    locationId: z.uuid(),
    productId: z.uuid().optional(),
    binId: z.uuid().optional(),
    disposition: z.enum(["SELLABLE", "QUARANTINED", "DISCREPANCY"]).optional(),
  }).merge(pageSchema).parse(req.query);
  await requireManagedWarehouseLocation(query.locationId);
  const filters = [eq(warehouseBins.locationId, query.locationId)];
  if (query.productId) filters.push(eq(warehouseBinBalances.productId, query.productId));
  if (query.binId) filters.push(eq(warehouseBinBalances.binId, query.binId));
  if (query.disposition) filters.push(eq(warehouseBinBalances.disposition, query.disposition));
  const rows = await db.select({
    balanceId: warehouseBinBalances.id,
    binId: warehouseBins.id,
    binCode: warehouseBins.code,
    binName: warehouseBins.name,
    binType: warehouseBins.binType,
    productId: warehouseBinBalances.productId,
    disposition: warehouseBinBalances.disposition,
    quantity: warehouseBinBalances.quantity,
    reservedQuantity: warehouseBinBalances.reservedQuantity,
    availableQuantity: sql<number>`${warehouseBinBalances.quantity} - ${warehouseBinBalances.reservedQuantity}`,
    updatedAt: warehouseBinBalances.updatedAt,
  }).from(warehouseBinBalances).innerJoin(warehouseBins, eq(warehouseBins.id, warehouseBinBalances.binId))
    .where(and(...filters)).orderBy(asc(warehouseBins.code), asc(warehouseBinBalances.productId))
    .limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  return res.status(200).json({ data: rows, page: query.page, pageSize: query.pageSize });
});

router.get("/movements", async (req, res) => {
  const query = z.object({
    locationId: z.uuid(),
    productId: z.uuid().optional(),
    binId: z.uuid().optional(),
    movementType: z.enum(["OPENING_BALANCE", "RECEIPT_INTAKE", "PUTAWAY", "BIN_TRANSFER", "QUARANTINE_TRANSFER", "INVENTORY_ADJUSTMENT"]).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }).merge(pageSchema).parse(req.query);
  await requireManagedWarehouseLocation(query.locationId);
  const filters = [eq(warehouseMovements.locationId, query.locationId)];
  if (query.productId) filters.push(eq(warehouseMovements.productId, query.productId));
  if (query.movementType) filters.push(eq(warehouseMovements.movementType, query.movementType));
  if (query.from) filters.push(gte(warehouseMovements.createdAt, new Date(query.from)));
  if (query.to) filters.push(lte(warehouseMovements.createdAt, new Date(query.to)));
  if (query.binId) filters.push(or(eq(warehouseMovements.sourceBinId, query.binId), eq(warehouseMovements.destinationBinId, query.binId))!);
  const rows = await db.select().from(warehouseMovements).where(and(...filters))
    .orderBy(desc(warehouseMovements.createdAt), desc(warehouseMovements.id))
    .limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  return res.status(200).json({ data: rows, page: query.page, pageSize: query.pageSize });
});

router.get("/reconciliation", async (req, res) => {
  const { locationId } = z.object({ locationId: z.uuid() }).parse(req.query);
  await requireManagedWarehouseLocation(locationId);
  const [inventoryRows, warehouseRows] = await Promise.all([
    getInventoryStockByLocation(locationId),
    db.select({ productId: warehouseBinBalances.productId, quantity: sql<number>`sum(${warehouseBinBalances.quantity})` })
      .from(warehouseBinBalances).innerJoin(warehouseBins, eq(warehouseBins.id, warehouseBinBalances.binId))
      .where(and(eq(warehouseBins.locationId, locationId), eq(warehouseBinBalances.disposition, "SELLABLE")))
      .groupBy(warehouseBinBalances.productId),
  ]);
  const inventory = new Map(inventoryRows.map((row) => [row.productId, row.quantityOnHand]));
  const warehouse = new Map(warehouseRows.map((row) => [row.productId, Number(row.quantity ?? 0)]));
  const productIds = new Set([...inventory.keys(), ...warehouse.keys()]);
  const records = [...productIds].map((productId) => {
    const inventoryQuantity = inventory.get(productId) ?? 0;
    const warehouseQuantity = warehouse.get(productId) ?? 0;
    return { productId, inventoryQuantity, warehouseQuantity, variance: warehouseQuantity - inventoryQuantity };
  }).filter((record) => record.variance !== 0).sort((left, right) => left.productId.localeCompare(right.productId));
  return res.status(200).json({
    data: { locationId, calculatedAt: new Date().toISOString(), inBalance: records.length === 0, varianceCount: records.length, records },
  });
});

export { router as queryRouter };

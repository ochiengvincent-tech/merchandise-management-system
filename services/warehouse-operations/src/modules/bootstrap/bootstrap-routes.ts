import { randomUUID } from "node:crypto";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
  warehouseBootstraps,
  warehouseMovements,
} from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";
import {
  enableInventoryWarehouseManagement,
  getInventoryLocation,
  getInventoryStockByLocation,
} from "../../clients/inventory-client.js";

const router: Router = Router();
const bootstrapSchema = z.object({ actorId: z.uuid() });

router.get("/locations/:locationId/bootstrap", async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const [bootstrap] = await db
    .select()
    .from(warehouseBootstraps)
    .where(eq(warehouseBootstraps.locationId, locationId))
    .limit(1);
  return res.status(200).json({ data: bootstrap ?? null });
});

router.post("/locations/:locationId/bootstrap", async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const { actorId } = bootstrapSchema.parse(req.body);
  const location = await getInventoryLocation(locationId);
  if (location.status !== "ACTIVE") throw new AppError("Inactive locations cannot be bootstrapped", 409);

  const [existing] = await db
    .select()
    .from(warehouseBootstraps)
    .where(eq(warehouseBootstraps.locationId, locationId))
    .limit(1);

  if (!existing) {
    if (location.warehouseManaged) {
      throw new AppError("Inventory already has Warehouse management enabled, but no bootstrap record exists. Reconcile this location before proceeding.", 409);
    }

    // Read Inventory through its API; Warehouse never reads Inventory tables.
    const stockRows = await getInventoryStockByLocation(locationId);
    const [unassignedBin] = await db.transaction(async (tx) => {
      const [bin] = await tx
        .insert(warehouseBins)
        .values({
          locationId,
          code: "__UNASSIGNED__",
          name: "Unassigned opening stock",
          binType: "UNASSIGNED",
          status: "ACTIVE",
          systemManaged: true,
        })
        .onConflictDoUpdate({
          target: [warehouseBins.locationId, warehouseBins.code],
          set: { updatedAt: new Date() },
        })
        .returning();
      if (!bin) throw new Error("Could not create the unassigned stock bin");

      for (const stock of stockRows) {
        if (stock.quantityOnHand <= 0) continue;
        await tx.insert(warehouseBinBalances).values({
          binId: bin.id,
          productId: stock.productId,
          disposition: "SELLABLE",
          quantity: stock.quantityOnHand,
        }).onConflictDoUpdate({
          target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition],
          set: { quantity: sql`${warehouseBinBalances.quantity} + ${stock.quantityOnHand}`, updatedAt: new Date() },
        });
        await tx.insert(warehouseMovements).values({
          idempotencyKey: randomUUID(),
          movementType: "OPENING_BALANCE",
          productId: stock.productId,
          quantity: stock.quantityOnHand,
          disposition: "SELLABLE",
          sourceBinId: null,
          destinationBinId: bin.id,
          locationId,
          referenceType: "INVENTORY_BOOTSTRAP",
          referenceId: stock.id,
          actorId,
          reason: "Opening balance imported from Inventory",
        });
      }

      const sourceTotalUnits = stockRows.reduce((total, stock) => total + stock.quantityOnHand, 0);
      await tx.insert(warehouseBootstraps).values({
        locationId,
        sourceStockCount: stockRows.length,
        sourceTotalUnits,
        varianceCount: 0,
        status: "COMPLETED",
      });
      await tx.insert(warehouseAuditLogs).values({
        action: "BOOTSTRAP_COMPLETED",
        actorId,
        locationId,
        binId: bin.id,
        details: {
          sourceStockCount: stockRows.length,
          sourceTotalUnits,
          source: "Inventory API",
        },
      });
      return [bin];
    });
    if (!unassignedBin) throw new Error("Opening balances were not imported");
  }

  // Enabling is idempotent so this also safely completes a retry after the
  // Warehouse transaction committed but Inventory's response was lost.
  await enableInventoryWarehouseManagement({
    locationId,
    actorId,
    bootstrapCompleted: true,
    reconciliationVarianceCount: 0,
  });

  const [bootstrap] = await db
    .select()
    .from(warehouseBootstraps)
    .where(eq(warehouseBootstraps.locationId, locationId))
    .limit(1);
  return res.status(existing ? 200 : 201).json({ data: bootstrap, location });
});

export { router as bootstrapRouter };

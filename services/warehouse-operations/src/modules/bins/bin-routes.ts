import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins } from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";
import { getInventoryLocation } from "../../clients/inventory-client.js";

const router: Router = Router();
const binTypeSchema = z.enum(["STORAGE", "PICK_FACE", "QUARANTINE"]);
const createBinSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(255),
  binType: binTypeSchema,
  zone: z.string().trim().max(100).optional(),
  aisle: z.string().trim().max(50).optional(),
  rack: z.string().trim().max(50).optional(),
  shelf: z.string().trim().max(50).optional(),
  capacity: z.coerce.number().int().nonnegative().optional(),
  actorId: z.uuid(),
});

const updateBinSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  zone: z.string().trim().max(100).nullable().optional(),
  aisle: z.string().trim().max(50).nullable().optional(),
  rack: z.string().trim().max(50).nullable().optional(),
  shelf: z.string().trim().max(50).nullable().optional(),
  capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  actorId: z.uuid(),
}).refine((data) => Object.keys(data).some((key) => key !== "actorId"), { message: "Provide at least one bin field to update." });

router.get("/locations/:locationId/bins", async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  await getInventoryLocation(locationId);
  const search = z.string().trim().optional().parse(req.query.search);
  const status = z.enum(["ACTIVE", "INACTIVE"]).optional().parse(req.query.status);
  const filters = [eq(warehouseBins.locationId, locationId)];
  if (status) filters.push(eq(warehouseBins.status, status));
  if (search) filters.push(ilike(warehouseBins.name, `%${search}%`));
  const bins = await db.select().from(warehouseBins).where(and(...filters)).orderBy(asc(warehouseBins.code));
  return res.status(200).json({ data: bins });
});

router.post("/locations/:locationId/bins", async (req, res) => {
  const locationId = z.uuid().parse(req.params.locationId);
  const location = await getInventoryLocation(locationId);
  if (location.status !== "ACTIVE") throw new AppError("Inactive Inventory locations cannot have new bins", 409);
  if (!location.warehouseManaged) throw new AppError("Enable Warehouse Operations for this location before creating bins", 409);
  const data = createBinSchema.parse(req.body);
  const [bin] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(warehouseBins).values({
      locationId,
      code: data.code,
      name: data.name,
      binType: data.binType,
      zone: data.zone,
      aisle: data.aisle,
      rack: data.rack,
      shelf: data.shelf,
      capacity: data.capacity,
    }).returning();
    if (!created) throw new Error("Bin was not created");
    await tx.insert(warehouseAuditLogs).values({
      action: "BIN_CREATED",
      actorId: data.actorId,
      locationId,
      binId: created.id,
      details: { after: created },
    });
    return [created];
  });
  return res.status(201).json({ data: bin });
});


router.get("/bins/:binId", async (req, res) => {
  const binId = z.uuid().parse(req.params.binId);
  const [bin] = await db.select().from(warehouseBins).where(eq(warehouseBins.id, binId)).limit(1);
  if (!bin) throw new AppError("Warehouse bin not found", 404);
  const balances = await db.select({
    id: warehouseBinBalances.id,
    productId: warehouseBinBalances.productId,
    disposition: warehouseBinBalances.disposition,
    quantity: warehouseBinBalances.quantity,
    reservedQuantity: warehouseBinBalances.reservedQuantity,
    availableQuantity: sql<number>`${warehouseBinBalances.quantity} - ${warehouseBinBalances.reservedQuantity}`,
    updatedAt: warehouseBinBalances.updatedAt,
  }).from(warehouseBinBalances).where(eq(warehouseBinBalances.binId, binId));
  return res.status(200).json({ data: { bin, balances } });
});

router.patch("/bins/:binId", async (req, res) => {
  const binId = z.uuid().parse(req.params.binId);
  const data = updateBinSchema.parse(req.body);
  const [existing] = await db.select().from(warehouseBins).where(eq(warehouseBins.id, binId)).limit(1);
  if (!existing) throw new AppError("Warehouse bin not found", 404);
  if (existing.systemManaged && data.status === "INACTIVE") throw new AppError("System-managed bins cannot be deactivated", 409);
  if (data.status === "INACTIVE") {
    const [balance] = await db.select({ quantity: sql<number>`coalesce(sum(${warehouseBinBalances.quantity}), 0)` }).from(warehouseBinBalances).where(eq(warehouseBinBalances.binId, binId));
    if (Number(balance?.quantity ?? 0) > 0) throw new AppError("Bins with stock cannot be deactivated", 409);
  }
  const { actorId, ...changes } = data;
  const updated = await db.transaction(async (tx) => {
    const [bin] = await tx.update(warehouseBins).set({ ...changes, updatedAt: new Date() }).where(eq(warehouseBins.id, binId)).returning();
    if (!bin) throw new AppError("Warehouse bin not found", 404);
    await tx.insert(warehouseAuditLogs).values({ action: "BIN_UPDATED", actorId, locationId: existing.locationId, binId, details: { before: existing, after: bin } });
    return bin;
  });
  return res.status(200).json({ data: updated });
});

export { router as binRouter };

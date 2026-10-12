import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  warehouseAdjustmentCommands,
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
} from "../../db/schema/warehouse.js";
import { AppError } from "../../errors/app-error.js";

export type WarehouseAdjustmentCommandInput = {
  idempotencyKey: string;
  locationId: string;
  productId: string;
  sourceBinId: string;
  quantityChange: number;
  reason: string;
  actorId: string;
};

export const createAdjustmentCommand = (
  input: WarehouseAdjustmentCommandInput,
  requestHash: string,
) =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`,
    );
    const [existing] = await tx
      .select()
      .from(warehouseAdjustmentCommands)
      .where(
        eq(warehouseAdjustmentCommands.idempotencyKey, input.idempotencyKey),
      )
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new AppError(
          "Idempotency-Key was already used with different adjustment data",
          409,
        );
      return existing;
    }

    const [bin] = await tx
      .select()
      .from(warehouseBins)
      .where(
        and(
          eq(warehouseBins.id, input.sourceBinId),
          eq(warehouseBins.locationId, input.locationId),
          eq(warehouseBins.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (
      !bin ||
      !["RECEIVING", "STORAGE", "PICK_FACE", "UNASSIGNED"].includes(bin.binType)
    ) {
      throw new AppError(
        "Choose an active sellable bin in this location",
        400,
        [
          {
            field: "sourceBinId",
            message:
              "The source must be an active receiving, storage, pick-face, or unassigned bin.",
          },
        ],
      );
    }
    const [balance] = await tx
      .select()
      .from(warehouseBinBalances)
      .where(
        and(
          eq(warehouseBinBalances.binId, input.sourceBinId),
          eq(warehouseBinBalances.productId, input.productId),
          eq(warehouseBinBalances.disposition, "SELLABLE"),
        ),
      )
      .for("update")
      .limit(1);
    if (
      input.quantityChange < 0 &&
      (!balance ||
        balance.quantity - balance.reservedQuantity <
          Math.abs(input.quantityChange))
    ) {
      throw new AppError(
        "Adjustment exceeds available sellable quantity in this bin",
        409,
        [
          {
            field: "quantityChange",
            message:
              "Reduce the quantity or choose a bin with enough unreserved units.",
          },
        ],
      );
    }
    const [created] = await tx
      .insert(warehouseAdjustmentCommands)
      .values({
        idempotencyKey: input.idempotencyKey,
        requestHash,
        locationId: input.locationId,
        productId: input.productId,
        sourceBinId: input.sourceBinId,
        quantityChange: input.quantityChange,
        reservedQuantity:
          input.quantityChange < 0 ? Math.abs(input.quantityChange) : 0,
        reason: input.reason,
        actorId: input.actorId,
        status: "PENDING",
      })
      .returning();
    if (!created)
      throw new Error("Warehouse adjustment command was not created");
    if (input.quantityChange < 0 && balance) {
      await tx
        .update(warehouseBinBalances)
        .set({
          reservedQuantity: sql`${warehouseBinBalances.reservedQuantity} + ${Math.abs(input.quantityChange)}`,
          updatedAt: new Date(),
        })
        .where(eq(warehouseBinBalances.id, balance.id));
    }
    await tx.insert(warehouseAuditLogs).values({
      action: "INVENTORY_ADJUSTMENT_REQUESTED",
      actorId: input.actorId,
      locationId: input.locationId,
      binId: input.sourceBinId,
      details: {
        warehouseCommandId: created.id,
        productId: input.productId,
        quantityChange: input.quantityChange,
        reason: input.reason,
        status: "PENDING",
      },
    });
    return created;
  });

export const failAdjustmentCommand = (command: {
  id: string;
  quantityChange: number;
  sourceBinId: string;
  productId: string;
}) =>
  db.transaction(async (tx) => {
    await tx
      .update(warehouseAdjustmentCommands)
      .set({ status: "FAILED", reservedQuantity: 0, updatedAt: new Date() })
      .where(eq(warehouseAdjustmentCommands.id, command.id));
    if (command.quantityChange < 0) {
      await tx
        .update(warehouseBinBalances)
        .set({
          reservedQuantity: sql`GREATEST(${warehouseBinBalances.reservedQuantity} - ${Math.abs(command.quantityChange)}, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(warehouseBinBalances.binId, command.sourceBinId),
            eq(warehouseBinBalances.productId, command.productId),
            eq(warehouseBinBalances.disposition, "SELLABLE"),
          ),
        );
    }
  });

export const findWarehouseAdjustmentById = async (id: string) => {
  const [command] = await db
    .select()
    .from(warehouseAdjustmentCommands)
    .where(eq(warehouseAdjustmentCommands.id, id))
    .limit(1);
  return command ?? null;
};

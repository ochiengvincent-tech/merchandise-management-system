import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { getInventoryLocation } from "../../clients/inventory-client.js";
import {
  warehouseAdjustmentCommands,
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
  warehouseMovements,
  warehouseProcessedEvents,
  warehousePutawayTaskLines,
  warehousePutawayTasks,
  warehouseReceiptLines,
  warehouseReceipts,
} from "../../db/schema/warehouse.js";

export type GoodsReceivedEvent = {
  eventId: string;
  occurredAt: string;
  payload: {
    goodsReceiptId: string;
    grnNumber: string;
    purchaseOrderId: string;
    destinationLocationId: string;
    receivedBy: string;
    lines: Array<{
      purchaseOrderLineId: string | null;
      productId: string;
      quantityObserved: number;
      quantityDamaged: number;
      quantityAccepted: number;
    }>;
  };
};

const systemBins = [
  { code: "__RECEIVING__", name: "Receiving", binType: "RECEIVING" },
  { code: "__QUARANTINE__", name: "Quarantine", binType: "QUARANTINE" },
  { code: "__DISCREPANCY__", name: "Supplier discrepancy", binType: "DISCREPANCY" },
  { code: "__UNASSIGNED__", name: "Unassigned opening stock", binType: "UNASSIGNED" },
] as const;

async function ensureSystemBin(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  locationId: string,
  bin: (typeof systemBins)[number],
) {
  await tx
    .insert(warehouseBins)
    .values({
      locationId,
      code: bin.code,
      name: bin.name,
      binType: bin.binType,
      status: "ACTIVE",
      systemManaged: true,
    })
    .onConflictDoNothing({ target: [warehouseBins.locationId, warehouseBins.code] });
  const [row] = await tx
    .select()
    .from(warehouseBins)
    .where(
      and(
        eq(warehouseBins.locationId, locationId),
        eq(warehouseBins.code, bin.code),
      ),
    )
    .limit(1);
  if (!row) throw new Error(`Could not create system bin ${bin.code}`);
  return row;
}

async function addBalance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    binId: string;
    productId: string;
    disposition: "SELLABLE" | "QUARANTINED" | "DISCREPANCY";
    quantity: number;
  },
) {
  if (input.quantity <= 0) return;
  await tx
    .insert(warehouseBinBalances)
    .values(input)
    .onConflictDoUpdate({
      target: [
        warehouseBinBalances.binId,
        warehouseBinBalances.productId,
        warehouseBinBalances.disposition,
      ],
      set: {
        quantity: sql`${warehouseBinBalances.quantity} + ${input.quantity}`,
        updatedAt: new Date(),
      },
    });
}

async function recordReceiptMovement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    locationId: string;
    productId: string;
    binId: string;
    quantity: number;
    disposition: "SELLABLE" | "QUARANTINED" | "DISCREPANCY";
    goodsReceiptId: string;
    receivedBy: string;
  },
) {
  if (input.quantity <= 0) return;
  await tx.insert(warehouseMovements).values({
    idempotencyKey: randomUUID(),
    movementType: "RECEIPT_INTAKE",
    productId: input.productId,
    quantity: input.quantity,
    disposition: input.disposition,
    sourceBinId: null,
    destinationBinId: input.binId,
    locationId: input.locationId,
    referenceType: "GOODS_RECEIPT",
    referenceId: input.goodsReceiptId,
    actorId: input.receivedBy,
    reason: "Goods received from Receiving event",
  });
}

export async function recordGoodsReceivedEvent(event: GoodsReceivedEvent) {
  const location = await getInventoryLocation(event.payload.destinationLocationId);
  if (location.status !== "ACTIVE" || !location.warehouseManaged) {
    return { duplicate: false, ignored: true, reason: "Location is not Warehouse-managed" };
  }
  return db.transaction(async (tx) => {
    const [processed] = await tx
      .insert(warehouseProcessedEvents)
      .values({ eventId: event.eventId, eventType: "GoodsReceived" })
      .onConflictDoNothing()
      .returning({ eventId: warehouseProcessedEvents.eventId });
    if (!processed) return { duplicate: true };

    const { payload } = event;
    const receivingBin = await ensureSystemBin(tx, payload.destinationLocationId, systemBins[0]);
    const quarantineBin = await ensureSystemBin(tx, payload.destinationLocationId, systemBins[1]);
    const discrepancyBin = await ensureSystemBin(tx, payload.destinationLocationId, systemBins[2]);

    await tx.insert(warehouseReceipts).values({
      goodsReceiptId: payload.goodsReceiptId,
      sourceEventId: event.eventId,
      grnNumber: payload.grnNumber,
      purchaseOrderId: payload.purchaseOrderId,
      locationId: payload.destinationLocationId,
      receivedBy: payload.receivedBy,
      receivedAt: new Date(event.occurredAt),
    });

    const receiptLines = await tx
      .insert(warehouseReceiptLines)
      .values(payload.lines.map((line, lineIndex) => ({
        goodsReceiptId: payload.goodsReceiptId,
        lineIndex,
        purchaseOrderLineId: line.purchaseOrderLineId,
        productId: line.productId,
        quantityObserved: line.quantityObserved,
        quantityDamaged: line.quantityDamaged,
        quantityAccepted: line.quantityAccepted,
        quantityDiscrepancy: line.quantityObserved - line.quantityDamaged - line.quantityAccepted,
      })))
      .returning();

    let acceptedLineCount = 0;
    const acceptedTaskLines: Array<{ receiptLineId: string; productId: string; quantityAccepted: number }> = [];
    for (const [index, line] of payload.lines.entries()) {
      const accepted = line.quantityAccepted;
      const damaged = line.quantityDamaged;
      const discrepancy = line.quantityObserved - damaged - accepted;
      if (accepted > 0) acceptedLineCount += 1;

      await addBalance(tx, {
        binId: receivingBin.id,
        productId: line.productId,
        disposition: "SELLABLE",
        quantity: accepted,
      });
      await addBalance(tx, {
        binId: quarantineBin.id,
        productId: line.productId,
        disposition: "QUARANTINED",
        quantity: damaged,
      });
      await addBalance(tx, {
        binId: discrepancyBin.id,
        productId: line.productId,
        disposition: "DISCREPANCY",
        quantity: discrepancy,
      });

      const receiptLine = receiptLines[index];
      if (!receiptLine) throw new Error("Receipt line projection was not created");
      await recordReceiptMovement(tx, {
        locationId: payload.destinationLocationId,
        productId: line.productId,
        binId: receivingBin.id,
        quantity: accepted,
        disposition: "SELLABLE",
        goodsReceiptId: payload.goodsReceiptId,
        receivedBy: payload.receivedBy,
      });
      await recordReceiptMovement(tx, {
        locationId: payload.destinationLocationId,
        productId: line.productId,
        binId: quarantineBin.id,
        quantity: damaged,
        disposition: "QUARANTINED",
        goodsReceiptId: payload.goodsReceiptId,
        receivedBy: payload.receivedBy,
      });
      await recordReceiptMovement(tx, {
        locationId: payload.destinationLocationId,
        productId: line.productId,
        binId: discrepancyBin.id,
        quantity: discrepancy,
        disposition: "DISCREPANCY",
        goodsReceiptId: payload.goodsReceiptId,
        receivedBy: payload.receivedBy,
      });
      if (accepted > 0) {
        acceptedTaskLines.push({
          receiptLineId: receiptLine.id,
          productId: line.productId,
          quantityAccepted: accepted,
        });
      }
    }

    if (acceptedLineCount > 0) {
      const [task] = await tx
        .insert(warehousePutawayTasks)
        .values({ goodsReceiptId: payload.goodsReceiptId, locationId: payload.destinationLocationId })
        .returning({ id: warehousePutawayTasks.id });
      if (!task) throw new Error("Putaway task was not created");
      await tx.insert(warehousePutawayTaskLines).values(
        acceptedTaskLines.map((line) => ({ ...line, taskId: task.id })),
      );
    }

    await tx.insert(warehouseAuditLogs).values({
      action: "GOODS_RECEIPT_PROJECTED",
      actorId: payload.receivedBy,
      locationId: payload.destinationLocationId,
      details: {
        goodsReceiptId: payload.goodsReceiptId,
        grnNumber: payload.grnNumber,
        purchaseOrderId: payload.purchaseOrderId,
        lineCount: payload.lines.length,
        acceptedLineCount,
      },
    });

    return { duplicate: false, goodsReceiptId: payload.goodsReceiptId, acceptedLineCount };
  });
}

export type InventoryStockAdjustedEvent = {
  eventId: string;
  occurredAt: string;
  payload: {
    adjustmentId: string;
    warehouseCommandId: string;
    productId: string;
    locationId: string;
    sourceBinId: string;
    quantityChange: number;
    actorId: string;
  };
};

export async function recordInventoryStockAdjustedEvent(event: InventoryStockAdjustedEvent) {
  return db.transaction(async (tx) => {
    const [processed] = await tx.insert(warehouseProcessedEvents)
      .values({ eventId: event.eventId, eventType: "InventoryStockAdjusted" })
      .onConflictDoNothing()
      .returning({ eventId: warehouseProcessedEvents.eventId });
    if (!processed) return { duplicate: true };

    const [command] = await tx.select().from(warehouseAdjustmentCommands)
      .where(eq(warehouseAdjustmentCommands.id, event.payload.warehouseCommandId))
      .limit(1);
    if (!command || command.status === "SYNCED") return { duplicate: false, ignored: true };
    if (command.locationId !== event.payload.locationId || command.productId !== event.payload.productId || command.sourceBinId !== event.payload.sourceBinId || command.quantityChange !== event.payload.quantityChange) {
      throw new Error("Inventory adjustment event does not match the pending Warehouse command");
    }

    const [balance] = await tx.select().from(warehouseBinBalances)
      .where(and(
        eq(warehouseBinBalances.binId, command.sourceBinId),
        eq(warehouseBinBalances.productId, command.productId),
        eq(warehouseBinBalances.disposition, "SELLABLE"),
      )).for("update").limit(1);
    const delta = command.quantityChange;
    if (delta < 0 && (!balance || balance.quantity < Math.abs(delta))) {
      throw new Error("Warehouse source bin no longer has enough sellable stock for the confirmed adjustment");
    }
    if (delta > 0) {
      await addBalance(tx, { binId: command.sourceBinId, productId: command.productId, disposition: "SELLABLE", quantity: delta });
    } else {
      await tx.update(warehouseBinBalances)
        .set({
          quantity: sql`${warehouseBinBalances.quantity} - ${Math.abs(delta)}`,
          reservedQuantity: sql`GREATEST(${warehouseBinBalances.reservedQuantity} - ${Math.abs(delta)}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(warehouseBinBalances.id, balance!.id));
    }
    const [movement] = await tx.insert(warehouseMovements).values({
      idempotencyKey: event.eventId,
      movementType: "INVENTORY_ADJUSTMENT",
      productId: command.productId,
      quantity: Math.abs(delta),
      disposition: "SELLABLE",
      sourceBinId: delta < 0 ? command.sourceBinId : null,
      destinationBinId: command.sourceBinId,
      locationId: command.locationId,
      referenceType: "INVENTORY_ADJUSTMENT",
      referenceId: event.payload.adjustmentId,
      actorId: event.payload.actorId,
      reason: command.reason,
    }).returning();
    if (!movement) throw new Error("Warehouse adjustment movement was not recorded");
    await tx.update(warehouseAdjustmentCommands)
      .set({ status: "SYNCED", inventoryAdjustmentId: event.payload.adjustmentId, reservedQuantity: 0, updatedAt: new Date() })
      .where(eq(warehouseAdjustmentCommands.id, command.id));
    await tx.insert(warehouseAuditLogs).values({
      action: "INVENTORY_ADJUSTMENT_SYNCED",
      actorId: event.payload.actorId,
      locationId: command.locationId,
      binId: command.sourceBinId,
      movementId: movement.id,
      details: { warehouseCommandId: command.id, inventoryAdjustmentId: event.payload.adjustmentId, quantityChange: delta, reason: command.reason },
    });
    return { duplicate: false, warehouseCommandId: command.id, inventoryAdjustmentId: event.payload.adjustmentId };
  });
}

import { createHash } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import {
  addReturnedBalance,
  createReturnBinIfMissing,
  createSaleMovement,
  createWarehouseAuditLog,
  decreaseBinBalance,
  findActiveReturnBin,
  findSellableBinsForProduct,
  markWarehouseEventProcessed,
  runWarehouseTransaction,
} from "./sale-completed-repository.js";

const stableUuid = (value: string) => {
  const hex = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
};

export async function processSaleCompletedWarehouseEvent(input: {
  eventId: string;
  saleId: string;
  actorId: string;
  locationId: string;
  warehouseManaged: boolean;
  lines: Array<{ productId: string; quantity: number }>;
}) {
  await runWarehouseTransaction(async (tx) => {
    const inserted = await markWarehouseEventProcessed(
      tx,
      input.eventId,
      "SaleCompleted",
    );
    if (!inserted) return;
    if (!input.warehouseManaged) return;
    const grouped = new Map<string, number>();
    for (const line of input.lines)
      grouped.set(
        line.productId,
        (grouped.get(line.productId) ?? 0) + line.quantity,
      );
    for (const [productId, total] of grouped) {
      const bins = await findSellableBinsForProduct(
        tx,
        input.locationId,
        productId,
      );
      let remaining = total;
      for (const row of bins) {
        const available = row.balance.quantity - row.balance.reservedQuantity;
        const take = Math.min(available, remaining);
        if (take <= 0) continue;
        await decreaseBinBalance(tx, row.balance.id, take);
        const movementKey = stableUuid(
          `${input.eventId}:${productId}:${row.bin.id}`,
        );
        const [movement] = await createSaleMovement(tx, {
          idempotencyKey: movementKey,
          movementType: "SALE_CONSUMPTION",
          productId,
          quantity: take,
          disposition: "SELLABLE",
          sourceBinId: row.bin.id,
          destinationBinId: null,
          locationId: input.locationId,
          referenceType: "SALE",
          referenceId: input.saleId,
          actorId: input.actorId,
          reason: "Retail sale",
        });
        await createWarehouseAuditLog(tx, {
          action: "SALE_STOCK_CONSUMED",
          actorId: input.actorId,
          locationId: input.locationId,
          binId: row.bin.id,
          movementId: movement?.id,
          details: {
            saleId: input.saleId,
            eventId: input.eventId,
            productId,
            quantity: take,
          },
        });
        remaining -= take;
        if (remaining === 0) break;
      }
      if (remaining > 0)
        throw new AppError(
          "Warehouse sellable bin stock is lower than Inventory's reserved sale quantity",
          409,
          [
            {
              field: "stock",
              message: `Unable to map ${remaining} sold units of product ${productId} to available sellable bins.`,
            },
          ],
        );
    }
  });
}

export async function processSaleReturnedWarehouseEvent(input: {
  eventId: string;
  returnId: string;
  saleId: string;
  actorId: string;
  locationId: string;
  warehouseManaged: boolean;
  lines: Array<{
    productId: string;
    quantity: number;
    disposition: "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN";
  }>;
}) {
  await runWarehouseTransaction(async (tx) => {
    const inserted = await markWarehouseEventProcessed(
      tx,
      input.eventId,
      "SaleReturned",
    );
    if (!inserted || !input.warehouseManaged) return;
    const groups = new Map<
      string,
      {
        productId: string;
        quantity: number;
        disposition: "SELLABLE" | "QUARANTINED";
      }
    >();
    for (const line of input.lines) {
      if (line.disposition === "NO_STOCK_RETURN") continue;
      const disposition =
        line.disposition === "RESTOCK_SELLABLE" ? "SELLABLE" : "QUARANTINED";
      const key = `${line.productId}:${disposition}`;
      const existing = groups.get(key);
      groups.set(key, {
        productId: line.productId,
        quantity: (existing?.quantity ?? 0) + line.quantity,
        disposition,
      });
    }
    for (const group of groups.values()) {
      const binCode =
        group.disposition === "SELLABLE"
          ? "__UNASSIGNED__"
          : "__RETURNS_QUARANTINE__";
      if (group.disposition === "QUARANTINED") {
        await createReturnBinIfMissing(tx, {
          locationId: input.locationId,
          code: binCode,
          name: "Returned goods quarantine",
          binType: "QUARANTINE",
          systemManaged: true,
        });
      }
      const [bin] = await findActiveReturnBin(tx, input.locationId, binCode);
      if (!bin)
        throw new AppError(
          `Warehouse return bin ${binCode} is unavailable`,
          409,
        );
      await addReturnedBalance(tx, {
        binId: bin.id,
        productId: group.productId,
        disposition: group.disposition,
        quantity: group.quantity,
      });
      const movementIdempotencyKey = stableUuid(
        `${input.eventId}:${group.productId}:${group.disposition}`,
      );
      const [movement] = await createSaleMovement(tx, {
        idempotencyKey: movementIdempotencyKey,
        movementType: "RETURN_INTAKE",
        productId: group.productId,
        quantity: group.quantity,
        disposition: group.disposition,
        sourceBinId: null,
        destinationBinId: bin.id,
        locationId: input.locationId,
        referenceType: "SALE_RETURN",
        referenceId: input.returnId,
        actorId: input.actorId,
        reason: `Return from sale ${input.saleId}`,
      });
      await createWarehouseAuditLog(tx, {
        action: "SALE_RETURN_INTAKED",
        actorId: input.actorId,
        locationId: input.locationId,
        binId: bin.id,
        movementId: movement?.id,
        details: {
          saleId: input.saleId,
          returnId: input.returnId,
          productId: group.productId,
          quantity: group.quantity,
          disposition: group.disposition,
        },
      });
    }
  });
}

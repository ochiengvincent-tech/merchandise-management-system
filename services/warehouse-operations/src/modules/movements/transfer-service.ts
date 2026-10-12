import { requireManagedWarehouseLocation } from "../../clients/inventory-client.js";
import { AppError } from "../../errors/app-error.js";
import { withTransferTransaction } from "./transfer-repository.js";

type TransferInput = { idempotencyKey: string; locationId: string; productId: string; sourceBinId: string; destinationBinId: string; quantity: number; disposition: "SELLABLE" | "QUARANTINED" | "DISCREPANCY"; actorId: string; reason?: string };

export async function transferStock(input: TransferInput) {
  if (input.sourceBinId === input.destinationBinId) throw new AppError("Choose two different bins", 400, [{ field: "destinationBinId", message: "Source and destination must be different bins." }]);
  await requireManagedWarehouseLocation(input.locationId);
  return withTransferTransaction(input, async ({ previous, sourceBin, destinationBin, source, save }) => {
    if (previous) {
      const same = previous.movementType === (input.disposition === "SELLABLE" ? "BIN_TRANSFER" : "QUARANTINE_TRANSFER") && previous.locationId === input.locationId && previous.productId === input.productId && previous.sourceBinId === input.sourceBinId && previous.destinationBinId === input.destinationBinId && previous.quantity === input.quantity && previous.disposition === input.disposition;
      if (!same) throw new AppError("Idempotency-Key was already used with different movement data", 409);
      return { movement: previous, duplicate: true };
    }
    if (!sourceBin || !destinationBin) throw new AppError("Choose active bins in this location", 400);
    const supportedTypes = input.disposition === "SELLABLE" ? ["STORAGE", "PICK_FACE"] : input.disposition === "QUARANTINED" ? ["QUARANTINE"] : ["DISCREPANCY"];
    if (!supportedTypes.includes(sourceBin.binType) || !supportedTypes.includes(destinationBin.binType)) throw new AppError("Bins do not support the selected stock disposition", 400, [{ field: "disposition", message: "Sellable, quarantined, and discrepancy stock must stay in compatible bins." }]);
    if (!source || source.quantity - source.reservedQuantity < input.quantity) throw new AppError("Source bin does not have enough available stock", 409, [{ field: "quantity", message: "Reduce the transfer quantity or choose another source bin." }]);
    return { movement: await save(), duplicate: false };
  });
}

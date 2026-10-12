import { createHash } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import {
  getInventoryProduct,
  requireManagedWarehouseLocation,
  submitInventoryWarehouseAdjustment,
} from "../../clients/inventory-client.js";
import {
  createAdjustmentCommand,
  failAdjustmentCommand,
  findWarehouseAdjustmentById,
} from "./adjustment-repository.js";

export type SubmitAdjustment = {
  idempotencyKey: string;
  locationId: string;
  productId: string;
  sourceBinId: string;
  quantityChange: number;
  reason: string;
  actorId: string;
};

function requestHash(input: SubmitAdjustment) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        locationId: input.locationId,
        productId: input.productId,
        sourceBinId: input.sourceBinId,
        quantityChange: input.quantityChange,
        reason: input.reason,
        actorId: input.actorId,
      }),
    )
    .digest("hex");
}

export async function submitWarehouseAdjustment(input: SubmitAdjustment) {
  await requireManagedWarehouseLocation(input.locationId);
  const product = await getInventoryProduct(input.productId);
  if (product.status !== "ACTIVE")
    throw new AppError("Inactive products cannot be adjusted", 409);
  const hash = requestHash(input);

  const command = await createAdjustmentCommand(input, hash);

  if (command.status === "SYNCED") return { data: command, status: "SYNCED" };
  if (command.status === "FAILED")
    throw new AppError(
      "This adjustment command was rejected. Create a new command with a new idempotency key.",
      409,
    );

  try {
    await submitInventoryWarehouseAdjustment({
      productId: command.productId,
      locationId: command.locationId,
      quantityChange: command.quantityChange,
      reason: command.reason,
      createdBy: command.actorId,
      idempotencyKey: command.idempotencyKey,
      warehouseCommandId: command.id,
      sourceBinId: command.sourceBinId,
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      await failAdjustmentCommand(command);
    }
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Inventory adjustment is pending. Retry using the same Idempotency-Key.",
      503,
    );
  }

  return {
    data: command,
    status: "PENDING",
    message:
      "Inventory accepted the adjustment. Warehouse bin stock updates after its confirmation event is processed.",
  };
}

export async function getWarehouseAdjustment(id: string) {
  const command = await findWarehouseAdjustmentById(id);
  if (!command) throw new AppError("Warehouse adjustment not found", 404);
  return command;
}

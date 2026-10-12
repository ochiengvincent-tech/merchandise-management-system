import { AppError } from "../../errors/app-error.js";
import { findPutawayTask, findPutawayTasks, withPutawayTransaction } from "./putaway-repository.js";

export const listPutawayTasks = findPutawayTasks;

export async function getPutawayTask(taskId: string) {
  const task = await findPutawayTask(taskId);
  if (!task) throw new AppError("Putaway task not found", 404);
  return task;
}

export async function recordPutaway(input: { taskId: string; lineId: string; idempotencyKey: string; destinationBinId: string; quantity: number; actorId: string }) {
  return withPutawayTransaction(input, async ({ existing, line, task, receivingBin, destinationBin, sourceBalance, save }) => {
    if (existing) {
      if (existing.taskLineId !== input.lineId || existing.destinationBinId !== input.destinationBinId || existing.quantity !== input.quantity) throw new AppError("Idempotency-Key was already used with different putaway data", 409);
      return { movement: existing, duplicate: true };
    }
    if (!line || !task) throw new AppError("Putaway task line not found", 404);
    if (task.status === "COMPLETED") throw new AppError("Putaway task is already completed", 409);
    const remaining = line.quantityAccepted - line.quantityPlaced;
    if (remaining < input.quantity) throw new AppError("Putaway quantity exceeds the remaining task quantity", 409, [{ field: "quantity", message: `Only ${remaining} units remain to be put away.` }]);
    if (!receivingBin) throw new AppError("Receiving bin not found", 409);
    if (!destinationBin || !["STORAGE", "PICK_FACE"].includes(destinationBin.binType)) throw new AppError("Choose an active storage or pick-face bin in this location", 400, [{ field: "destinationBinId", message: "Choose a valid sellable destination bin." }]);
    if (!sourceBalance || sourceBalance.quantity < input.quantity) throw new AppError("Receiving bin does not have enough sellable units", 409);
    return { movement: await save(), duplicate: false };
  });
}

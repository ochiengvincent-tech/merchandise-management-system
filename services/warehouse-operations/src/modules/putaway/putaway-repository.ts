import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { warehouseAuditLogs, warehouseBinBalances, warehouseBins, warehouseMovements, warehousePutawayTaskLines, warehousePutawayTasks, warehouseReceipts, warehouseOutboxEvents } from "../../db/schema/warehouse.js";

type Movement = typeof warehouseMovements.$inferSelect;
type TaskLine = typeof warehousePutawayTaskLines.$inferSelect;
type Task = typeof warehousePutawayTasks.$inferSelect;
type Bin = typeof warehouseBins.$inferSelect;
type Balance = typeof warehouseBinBalances.$inferSelect;

export function findPutawayTasks(filters: { status?: "OPEN" | "IN_PROGRESS" | "COMPLETED"; locationId?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(warehousePutawayTasks.status, filters.status));
  if (filters.locationId) conditions.push(eq(warehousePutawayTasks.locationId, filters.locationId));
  return db.select({ id: warehousePutawayTasks.id, goodsReceiptId: warehousePutawayTasks.goodsReceiptId, locationId: warehousePutawayTasks.locationId, status: warehousePutawayTasks.status, createdAt: warehousePutawayTasks.createdAt, grnNumber: warehouseReceipts.grnNumber, purchaseOrderId: warehouseReceipts.purchaseOrderId, receivedAt: warehouseReceipts.receivedAt }).from(warehousePutawayTasks).innerJoin(warehouseReceipts, eq(warehouseReceipts.goodsReceiptId, warehousePutawayTasks.goodsReceiptId)).where(conditions.length ? and(...conditions) : undefined).orderBy(warehousePutawayTasks.createdAt);
}

export async function findPutawayTask(taskId: string) {
  const [task] = await db.select().from(warehousePutawayTasks).innerJoin(warehouseReceipts, eq(warehouseReceipts.goodsReceiptId, warehousePutawayTasks.goodsReceiptId)).where(eq(warehousePutawayTasks.id, taskId)).limit(1);
  if (!task) return null;
  const lines = await db.select({ id: warehousePutawayTaskLines.id, productId: warehousePutawayTaskLines.productId, quantityAccepted: warehousePutawayTaskLines.quantityAccepted, quantityPlaced: warehousePutawayTaskLines.quantityPlaced, quantityRemaining: sql<number>`${warehousePutawayTaskLines.quantityAccepted} - ${warehousePutawayTaskLines.quantityPlaced}` }).from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, taskId));
  return { task, lines };
}

export async function withPutawayTransaction<T>(input: { taskId: string; lineId: string; idempotencyKey: string; destinationBinId: string; quantity: number; actorId: string }, operation: (state: { existing?: Movement; line?: TaskLine; task?: Task; receivingBin?: Bin; destinationBin?: Bin; sourceBalance?: Balance; save: () => Promise<Movement> }) => Promise<T>) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(warehouseMovements).where(eq(warehouseMovements.idempotencyKey, input.idempotencyKey)).limit(1);
    const [taskRow] = await tx.select({ line: warehousePutawayTaskLines, task: warehousePutawayTasks }).from(warehousePutawayTaskLines).innerJoin(warehousePutawayTasks, eq(warehousePutawayTasks.id, warehousePutawayTaskLines.taskId)).where(and(eq(warehousePutawayTaskLines.id, input.lineId), eq(warehousePutawayTasks.id, input.taskId))).limit(1);
    const task = taskRow?.task;
    const line = taskRow?.line;
    const [receivingBin] = task ? await tx.select().from(warehouseBins).where(and(eq(warehouseBins.locationId, task.locationId), eq(warehouseBins.binType, "RECEIVING"), eq(warehouseBins.systemManaged, true))).limit(1) : [];
    const [destinationBin] = task ? await tx.select().from(warehouseBins).where(and(eq(warehouseBins.id, input.destinationBinId), eq(warehouseBins.locationId, task.locationId), eq(warehouseBins.status, "ACTIVE"))).limit(1) : [];
    const [sourceBalance] = receivingBin && line ? await tx.select().from(warehouseBinBalances).where(and(eq(warehouseBinBalances.binId, receivingBin.id), eq(warehouseBinBalances.productId, line.productId), eq(warehouseBinBalances.disposition, "SELLABLE"))).for("update").limit(1) : [];
    const save = async () => {
      if (!task || !line || !receivingBin || !destinationBin || !sourceBalance) throw new Error("Putaway state was not loaded");
      await tx.update(warehouseBinBalances).set({ quantity: sql`${warehouseBinBalances.quantity} - ${input.quantity}`, updatedAt: new Date() }).where(eq(warehouseBinBalances.id, sourceBalance.id));
      await tx.insert(warehouseBinBalances).values({ binId: destinationBin.id, productId: line.productId, disposition: "SELLABLE", quantity: input.quantity }).onConflictDoUpdate({ target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition], set: { quantity: sql`${warehouseBinBalances.quantity} + ${input.quantity}`, updatedAt: new Date() } });
      const [movement] = await tx.insert(warehouseMovements).values({ idempotencyKey: input.idempotencyKey, movementType: "PUTAWAY", productId: line.productId, quantity: input.quantity, disposition: "SELLABLE", sourceBinId: receivingBin.id, destinationBinId: destinationBin.id, locationId: task.locationId, referenceType: "PUTAWAY_TASK_LINE", referenceId: input.taskId, taskLineId: input.lineId, actorId: input.actorId }).returning();
      if (!movement) throw new Error("Putaway movement was not created");
      await tx.update(warehousePutawayTaskLines).set({ quantityPlaced: line.quantityPlaced + input.quantity }).where(eq(warehousePutawayTaskLines.id, input.lineId));
      const allLines = await tx.select().from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, input.taskId));
      const complete = allLines.every((item) => item.id === input.lineId ? item.quantityPlaced + input.quantity >= item.quantityAccepted : item.quantityPlaced >= item.quantityAccepted);
      await tx.update(warehousePutawayTasks).set({ status: complete ? "COMPLETED" : "IN_PROGRESS", updatedAt: new Date() }).where(eq(warehousePutawayTasks.id, input.taskId));
      await tx.insert(warehouseAuditLogs).values({ action: "PUTAWAY_RECORDED", actorId: input.actorId, locationId: task.locationId, binId: destinationBin.id, movementId: movement.id, details: { taskId: input.taskId, taskLineId: input.lineId, productId: line.productId, quantity: input.quantity, sourceBinId: receivingBin.id, destinationBinId: destinationBin.id } });
      if (complete) {
        const taskLines = await tx.select().from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, input.taskId));
        const taskMovements = await tx.select().from(warehouseMovements).where(inArray(warehouseMovements.taskLineId, taskLines.map((item) => item.id)));
        await tx.insert(warehouseOutboxEvents).values({ eventId: randomUUID(), eventType: "WarehousePutawayCompleted", aggregateType: "WarehousePutawayTask", aggregateId: input.taskId, payload: { taskId: input.taskId, goodsReceiptId: task.goodsReceiptId, locationId: task.locationId, lines: taskMovements.map((item) => ({ productId: item.productId, quantity: item.quantity, sourceBinId: item.sourceBinId, destinationBinId: item.destinationBinId })), actorId: input.actorId } });
      }
      return movement;
    };
    return operation({ existing, line, task, receivingBin, destinationBin, sourceBalance, save });
  });
}

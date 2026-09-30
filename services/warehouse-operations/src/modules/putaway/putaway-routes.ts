import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  warehouseAuditLogs,
  warehouseBinBalances,
  warehouseBins,
  warehouseMovements,
  warehousePutawayTaskLines,
  warehousePutawayTasks,
  warehouseReceipts,
  warehouseOutboxEvents,
} from "../../db/schema/warehouse.js";

const router: Router = Router();

router.get("/putaway-tasks", async (req, res) => {
  const status = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional().parse(req.query.status);
  const locationId = z.uuid().optional().parse(req.query.locationId);
  const filters = [];
  if (status) filters.push(eq(warehousePutawayTasks.status, status));
  if (locationId) filters.push(eq(warehousePutawayTasks.locationId, locationId));
  const tasks = await db.select({
    id: warehousePutawayTasks.id,
    goodsReceiptId: warehousePutawayTasks.goodsReceiptId,
    locationId: warehousePutawayTasks.locationId,
    status: warehousePutawayTasks.status,
    createdAt: warehousePutawayTasks.createdAt,
    grnNumber: warehouseReceipts.grnNumber,
    purchaseOrderId: warehouseReceipts.purchaseOrderId,
    receivedAt: warehouseReceipts.receivedAt,
  }).from(warehousePutawayTasks)
    .innerJoin(warehouseReceipts, eq(warehouseReceipts.goodsReceiptId, warehousePutawayTasks.goodsReceiptId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(warehousePutawayTasks.createdAt);
  return res.status(200).json({ data: tasks });
});

router.get("/putaway-tasks/:taskId", async (req, res) => {
  const taskId = z.uuid().parse(req.params.taskId);
  const [task] = await db.select().from(warehousePutawayTasks)
    .innerJoin(warehouseReceipts, eq(warehouseReceipts.goodsReceiptId, warehousePutawayTasks.goodsReceiptId))
    .where(eq(warehousePutawayTasks.id, taskId)).limit(1);
  if (!task) throw new AppError("Putaway task not found", 404);
  const lines = await db.select({
    id: warehousePutawayTaskLines.id,
    productId: warehousePutawayTaskLines.productId,
    quantityAccepted: warehousePutawayTaskLines.quantityAccepted,
    quantityPlaced: warehousePutawayTaskLines.quantityPlaced,
    quantityRemaining: sql<number>`${warehousePutawayTaskLines.quantityAccepted} - ${warehousePutawayTaskLines.quantityPlaced}`,
  }).from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, taskId));
  return res.status(200).json({ data: { task, lines } });
});

router.post("/putaway-tasks/:taskId/lines/:lineId/putaway", async (req, res) => {
  const taskId = z.uuid().parse(req.params.taskId);
  const lineId = z.uuid().parse(req.params.lineId);
  const idempotencyKey = z.uuid().safeParse(req.header("Idempotency-Key"));
  if (!idempotencyKey.success) throw new AppError("A UUID Idempotency-Key header is required", 400, [{ field: "Idempotency-Key", message: "Provide a unique UUID for this putaway movement." }]);
  const body = z.object({
    destinationBinId: z.uuid(),
    quantity: z.number().int().positive(),
    actorId: z.uuid(),
  }).parse(req.body);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(warehouseMovements)
      .where(eq(warehouseMovements.idempotencyKey, idempotencyKey.data)).limit(1);
    if (existing) {
      if (existing.taskLineId !== lineId || existing.destinationBinId !== body.destinationBinId || existing.quantity !== body.quantity) {
        throw new AppError("Idempotency-Key was already used with different putaway data", 409);
      }
      return { movement: existing, duplicate: true };
    }

    const [taskLine] = await tx.select().from(warehousePutawayTaskLines)
      .innerJoin(warehousePutawayTasks, eq(warehousePutawayTasks.id, warehousePutawayTaskLines.taskId))
      .where(and(eq(warehousePutawayTaskLines.id, lineId), eq(warehousePutawayTasks.id, taskId)))
      .limit(1);
    if (!taskLine) throw new AppError("Putaway task line not found", 404);
    const line = taskLine.warehouse_putaway_task_lines;
    const task = taskLine.warehouse_putaway_tasks;
    if (task.status === "COMPLETED") throw new AppError("Putaway task is already completed", 409);
    if (line.quantityAccepted - line.quantityPlaced < body.quantity) {
      throw new AppError("Putaway quantity exceeds the remaining task quantity", 409, [{ field: "quantity", message: `Only ${line.quantityAccepted - line.quantityPlaced} units remain to be put away.` }]);
    }

    const [receivingBin] = await tx.select().from(warehouseBins)
      .where(and(eq(warehouseBins.locationId, task.locationId), eq(warehouseBins.binType, "RECEIVING"), eq(warehouseBins.systemManaged, true)))
      .limit(1);
    const [destinationBin] = await tx.select().from(warehouseBins)
      .where(and(eq(warehouseBins.id, body.destinationBinId), eq(warehouseBins.locationId, task.locationId), eq(warehouseBins.status, "ACTIVE")))
      .limit(1);
    if (!receivingBin) throw new AppError("Receiving bin not found", 409);
    if (!destinationBin || !["STORAGE", "PICK_FACE"].includes(destinationBin.binType)) {
      throw new AppError("Choose an active storage or pick-face bin in this location", 400, [{ field: "destinationBinId", message: "Choose a valid sellable destination bin." }]);
    }

    const [sourceBalance] = await tx.select().from(warehouseBinBalances)
      .where(and(eq(warehouseBinBalances.binId, receivingBin.id), eq(warehouseBinBalances.productId, line.productId), eq(warehouseBinBalances.disposition, "SELLABLE")))
      .for("update").limit(1);
    if (!sourceBalance || sourceBalance.quantity < body.quantity) throw new AppError("Receiving bin does not have enough sellable units", 409);

    await tx.update(warehouseBinBalances).set({ quantity: sql`${warehouseBinBalances.quantity} - ${body.quantity}`, updatedAt: new Date() })
      .where(eq(warehouseBinBalances.id, sourceBalance.id));
    await tx.insert(warehouseBinBalances).values({
      binId: destinationBin.id,
      productId: line.productId,
      disposition: "SELLABLE",
      quantity: body.quantity,
    }).onConflictDoUpdate({
      target: [warehouseBinBalances.binId, warehouseBinBalances.productId, warehouseBinBalances.disposition],
      set: { quantity: sql`${warehouseBinBalances.quantity} + ${body.quantity}`, updatedAt: new Date() },
    });
    const [movement] = await tx.insert(warehouseMovements).values({
      idempotencyKey: idempotencyKey.data,
      movementType: "PUTAWAY",
      productId: line.productId,
      quantity: body.quantity,
      disposition: "SELLABLE",
      sourceBinId: receivingBin.id,
      destinationBinId: destinationBin.id,
      locationId: task.locationId,
      referenceType: "PUTAWAY_TASK_LINE",
      referenceId: taskId,
      taskLineId: lineId,
      actorId: body.actorId,
    }).returning();
    if (!movement) throw new Error("Putaway movement was not created");

    await tx.update(warehousePutawayTaskLines).set({ quantityPlaced: line.quantityPlaced + body.quantity }).where(eq(warehousePutawayTaskLines.id, lineId));
    const allLines = await tx.select().from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, taskId));
    const complete = allLines.every((item) => item.id === lineId
      ? item.quantityPlaced + body.quantity >= item.quantityAccepted
      : item.quantityPlaced >= item.quantityAccepted);
    await tx.update(warehousePutawayTasks).set({ status: complete ? "COMPLETED" : "IN_PROGRESS", updatedAt: new Date() }).where(eq(warehousePutawayTasks.id, taskId));
    await tx.insert(warehouseAuditLogs).values({
      action: "PUTAWAY_RECORDED",
      actorId: body.actorId,
      locationId: task.locationId,
      binId: destinationBin.id,
      movementId: movement.id,
      details: { taskId, taskLineId: lineId, productId: line.productId, quantity: body.quantity, sourceBinId: receivingBin.id, destinationBinId: destinationBin.id },
    });
    if (complete) {
      const taskLines = await tx.select().from(warehousePutawayTaskLines).where(eq(warehousePutawayTaskLines.taskId, taskId));
      const taskMovements = await tx.select().from(warehouseMovements).where(inArray(warehouseMovements.taskLineId, taskLines.map((taskLine) => taskLine.id)));
      await tx.insert(warehouseOutboxEvents).values({
        eventId: randomUUID(), eventType: "WarehousePutawayCompleted", aggregateType: "WarehousePutawayTask", aggregateId: taskId,
        payload: { taskId, goodsReceiptId: task.goodsReceiptId, locationId: task.locationId,
          lines: taskMovements.map((item) => ({ productId: item.productId, quantity: item.quantity, sourceBinId: item.sourceBinId, destinationBinId: item.destinationBinId })),
          actorId: body.actorId },
      });
    }
    return { movement, duplicate: false };
  });
  return res.status(result.duplicate ? 200 : 201).json({ data: result });
});

export { router as putawayRouter };

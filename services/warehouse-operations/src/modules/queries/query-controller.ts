import type { RequestHandler } from "express";
import { z } from "zod";
import { listStock, listMovements, reconcileLocation } from "./query-service.js";
const pageSchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });




export const getStockController: RequestHandler = async (req, res) => {
  const query = z.object({
    locationId: z.uuid(),
    productId: z.uuid().optional(),
    binId: z.uuid().optional(),
    disposition: z.enum(["SELLABLE", "QUARANTINED", "DISCREPANCY"]).optional(),
  }).merge(pageSchema).parse(req.query);
  const rows = await listStock(query);
  return res.status(200).json({ data: rows, page: query.page, pageSize: query.pageSize });
};

export const getMovementsController: RequestHandler = async (req, res) => {
  const query = z.object({
    locationId: z.uuid(),
    productId: z.uuid().optional(),
    binId: z.uuid().optional(),
    movementType: z.enum(["OPENING_BALANCE", "RECEIPT_INTAKE", "PUTAWAY", "BIN_TRANSFER", "QUARANTINE_TRANSFER", "INVENTORY_ADJUSTMENT", "SALE_CONSUMPTION", "RETURN_INTAKE"]).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }).merge(pageSchema).parse(req.query);
  const rows = await listMovements(query);
  return res.status(200).json({ data: rows, page: query.page, pageSize: query.pageSize });
};

export const getReconciliationController: RequestHandler = async (req, res) => {
  const { locationId } = z.object({ locationId: z.uuid() }).parse(req.query);
  return res.status(200).json({
    data: await reconcileLocation(locationId),
  });
};

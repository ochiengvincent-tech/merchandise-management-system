import type { Request, Response } from "express";
import {
  processPurchaseOrderApproved,
  processPurchaseOrderCancelled
} from "./purchase-order-event-service.js";

export const purchaseOrderApprovedEventController = async (
  req: Request,
  res: Response
) => {
  const result = await processPurchaseOrderApproved(req.body);

  return res.status(200).json(result);
};

export const purchaseOrderCancelledEventController = async (
  req: Request,
  res: Response
) => {
  const result = await processPurchaseOrderCancelled(req.body);

  return res.status(200).json(result);
};
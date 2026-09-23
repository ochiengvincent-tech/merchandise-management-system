import type { Request, Response, NextFunction } from "express";
import { requestPurchaseOrderAmendment } from "./amendment-service.js";
import { approvePurchaseOrderAmendment } from "./amendment-approval-service.js";
import { rejectPurchaseOrderAmendment } from "./amendment-rejection-service.js";

export async function requestPurchaseOrderAmendmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { requestedBy, reason, notes, destinationLocationId } = req.body;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid purchase order ID",
        },
      });
    }

    if (typeof requestedBy !== "string") {
      return res.status(400).json({
        error: {
          message: "requestedBy is required",
        },
      });
    }

    if (typeof reason !== "string") {
      return res.status(400).json({
        error: {
          message: "reason is required",
        },
      });
    }

    const amendment = await requestPurchaseOrderAmendment(
      id,
      {
        notes,
        destinationLocationId,
      },
      requestedBy,
      reason,
    );

    if (!amendment) {
      return res.status(404).json({
        error: {
          message: "Purchase order not found",
        },
      });
    }

    return res.status(201).json({
      data: amendment,
    });
  } catch (error) {
    next(error);
  }
}

export async function approvePurchaseOrderAmendmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { approverId } = req.body;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid amendment ID",
        },
      });
    }

    if (typeof approverId !== "string") {
      return res.status(400).json({
        error: {
          message: "approverId is required",
        },
      });
    }

    const result = await approvePurchaseOrderAmendment(id, approverId);

    if (!result) {
      return res.status(404).json({
        error: {
          message: "Purchase order amendment not found",
        },
      });
    }

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectPurchaseOrderAmendmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { approverId, comments } = req.body;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid amendment ID",
        },
      });
    }

    if (typeof approverId !== "string") {
      return res.status(400).json({
        error: {
          message: "approverId is required",
        },
      });
    }

    const amendment = await rejectPurchaseOrderAmendment(
      id,
      approverId,
      comments,
    );

    if (!amendment) {
      return res.status(404).json({
        error: {
          message: "Purchase order amendment not found",
        },
      });
    }

    return res.status(200).json({
      data: amendment,
    });
  } catch (error) {
    next(error);
  }
}

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getPurchaseOrderAmendments,
  listPurchaseOrderAmendmentQueue,
  requestPurchaseOrderAmendment,
} from "./amendment-service.js";
import { approvePurchaseOrderAmendment } from "./amendment-approval-service.js";
import { rejectPurchaseOrderAmendment } from "./amendment-rejection-service.js";

const amendmentQueueQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export async function listPurchaseOrderAmendmentQueueController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = amendmentQueueQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: { message: "Invalid amendment queue query parameters" },
      });
    }

    const { page, limit, status } = query.data;
    const result = await listPurchaseOrderAmendmentQueue({
      offset: (page - 1) * limit,
      limit,
      status,
    });

    return res.status(200).json({
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listPurchaseOrderAmendmentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      return res.status(400).json({
        error: { message: "Invalid purchase order ID" },
      });
    }

    const amendments = await getPurchaseOrderAmendments(id);
    if (!amendments) {
      return res.status(404).json({
        error: { message: "Purchase order not found" },
      });
    }

    return res.status(200).json({ data: amendments });
  } catch (error) {
    next(error);
  }
}

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

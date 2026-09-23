import type {
  Request,
  Response,
  NextFunction,
} from "express";
import { submitPurchaseOrderForApproval } from "./purchase-order-submission-service.js";

export async function submitPurchaseOrderForApprovalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { actorId } = req.body;

    if (typeof id !== "string") {
      return res.status(400).json({
        error: {
          message: "Invalid purchase order ID",
        },
      });
    }

    if (typeof actorId !== "string") {
      return res.status(400).json({
        error: {
          message: "actorId is required",
        },
      });
    }

    const purchaseOrder =
      await submitPurchaseOrderForApproval(
        id,
        actorId,
      );

    if (!purchaseOrder) {
      return res.status(404).json({
        error: {
          message: "Purchase order not found",
        },
      });
    }

    return res.status(200).json({
      data: purchaseOrder,
    });
  } catch (error) {
    next(error);
  }
}
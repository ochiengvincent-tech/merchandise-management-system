import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { listPurchaseOrders } from "./purchase-order-service.js";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        value.split(",").every((status) =>
          [
            "DRAFT",
            "PENDING_APPROVAL",
            "APPROVED",
            "SENT",
            "PARTIALLY_RECEIVED",
            "COMPLETED",
            "CANCELLED",
          ].includes(status.trim()),
        ),
      "One or more purchase order statuses are invalid",
    ),
  search: z.string().trim().optional(),
});

export async function listPurchaseOrdersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = querySchema.safeParse(req.query);

    if (!query.success) {
      return res.status(400).json({
        error: {
          message: "Invalid purchase order query parameters",
        },
      });
    }

    const { page, limit, status, search } = query.data;
    const offset = (page - 1) * limit;

    const result = await listPurchaseOrders({
      offset,
      limit,
      status,
      search,
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

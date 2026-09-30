import type { Request, Response } from "express";

import { env } from "../../config/env.js";

export function getPurchaseOrderPolicyController(_req: Request, res: Response) {
  return res.status(200).json({
    data: {
      currency: "KES",
      maxPoValueKes: env.MAX_PO_VALUE_KES.toFixed(2),
    },
  });
}

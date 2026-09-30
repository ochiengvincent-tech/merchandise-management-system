import { z } from "zod";

export const warehouseManagementSchema = z.object({
  actorId: z.uuid(),
  bootstrapCompleted: z.literal(true),
  reconciliationVarianceCount: z.number().int().nonnegative(),
}).superRefine((value, context) => {
  if (value.reconciliationVarianceCount !== 0) {
    context.addIssue({
      code: "custom",
      path: ["reconciliationVarianceCount"],
      message: "Resolve all inventory variances before enabling Warehouse Operations.",
    });
  }
});

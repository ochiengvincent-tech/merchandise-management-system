import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reorderSuggestions } from "../../db/schema/index.js";

export const findPendingReorderSuggestion = (id: string) =>
  db.query.reorderSuggestions.findFirst({
    where: and(
      eq(reorderSuggestions.id, id),
      eq(reorderSuggestions.status, "PENDING"),
    ),
  });

export const listReorderSuggestions = () =>
  db
    .select()
    .from(reorderSuggestions)
    .where(eq(reorderSuggestions.status, "PENDING"))
    .orderBy(asc(reorderSuggestions.createdAt));

export const setReorderSuggestionStatus = async (
  id: string,
  status: "CONVERTED" | "DISMISSED",
  purchaseOrderId?: string,
) => {
  const [suggestion] = await db
    .update(reorderSuggestions)
    .set({
      status,
      purchaseOrderId: purchaseOrderId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reorderSuggestions.id, id),
        eq(reorderSuggestions.status, "PENDING"),
      ),
    )
    .returning();

  return suggestion ?? null;
};

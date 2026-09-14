import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vendorProductPrices } from "../../db/schema/vendor-product-prices.js";

export async function createVendorProductPrice(
  data: typeof vendorProductPrices.$inferInsert,
) {
  const [vendorProductPrice] = await db
    .insert(vendorProductPrices)
    .values(data)
    .returning();

  return vendorProductPrice;
}

export async function findCurrentVendorProductPrice(
  vendorProductId: string,
) {
  const [vendorProductPrice] = await db
    .select()
    .from(vendorProductPrices)
    .where(
      and(
        eq(vendorProductPrices.vendorProductId, vendorProductId),
        isNull(vendorProductPrices.effectiveTo),
      ),
    )
    .limit(1);

  return vendorProductPrice ?? null;
}

export async function closeVendorProductPrice(
  id: string,
  effectiveTo: Date,
) {
  const [vendorProductPrice] = await db
    .update(vendorProductPrices)
    .set({
      effectiveTo,
    })
    .where(eq(vendorProductPrices.id, id))
    .returning();

  return vendorProductPrice ?? null;
}
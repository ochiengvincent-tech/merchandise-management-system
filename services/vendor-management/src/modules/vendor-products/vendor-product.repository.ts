import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vendorProducts } from "../../db/schema/vendor-products.js";

export async function createVendorProduct(
  data: typeof vendorProducts.$inferInsert,
) {
  const [vendorProduct] = await db
    .insert(vendorProducts)
    .values(data)
    .returning();

  return vendorProduct;
}

export async function findVendorProductById(id: string) {
  const [vendorProduct] = await db
    .select()
    .from(vendorProducts)
    .where(eq(vendorProducts.id, id))
    .limit(1);

  return vendorProduct ?? null;
}

export async function findVendorProductByVendorAndProduct(
  vendorId: string,
  productId: string,
) {
  const [vendorProduct] = await db
    .select()
    .from(vendorProducts)
    .where(
      and(
        eq(vendorProducts.vendorId, vendorId),
        eq(vendorProducts.productId, productId),
      ),
    )
    .limit(1);

  return vendorProduct ?? null;
}

export async function listVendorProducts(vendorId: string) {
  return db
    .select()
    .from(vendorProducts)
    .where(eq(vendorProducts.vendorId, vendorId))
    .orderBy(desc(vendorProducts.createdAt));
}

export async function updateVendorProduct(
  id: string,
  data: {
    supplierProductCode?: string;
    currentPrice?: string;
    leadTimeDays?: number;
  },
) {
  const [vendorProduct] = await db
    .update(vendorProducts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(vendorProducts.id, id))
    .returning();

  return vendorProduct ?? null;
}

export async function updateVendorProductStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE",
) {
  const [vendorProduct] = await db
    .update(vendorProducts)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendorProducts.id, id))
    .returning();

  return vendorProduct ?? null;
}

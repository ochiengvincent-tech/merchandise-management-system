import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vendorProducts } from "../../db/schema/vendor-products.js";
import { vendorProductPrices } from "../../db/schema/vendor-product-prices.js";

export async function createVendorProduct(
  data: typeof vendorProducts.$inferInsert,
) {
  const [vendorProduct] = await db
    .insert(vendorProducts)
    .values(data)
    .returning();

  return vendorProduct;
}

export async function createVendorProductWithPrice(
  vendorProductData: typeof vendorProducts.$inferInsert,
  price: string,
  effectiveFrom: Date,
) {
  return db.transaction(async (tx) => {
    const [vendorProduct] = await tx
      .insert(vendorProducts)
      .values(vendorProductData)
      .returning();

    if (!vendorProduct) {
      throw new Error("Failed to create vendor product");
    }

    const [vendorProductPrice] = await tx
      .insert(vendorProductPrices)
      .values({
        vendorProductId: vendorProduct.id,
        price,
        effectiveFrom,
      })
      .returning();

    if (!vendorProductPrice) {
      throw new Error("Failed to create vendor product price");
    }

    return {
      vendorProduct,
      vendorProductPrice,
    };
  });
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
export async function updateVendorProductWithPrice(
  id: string,
  data: {
    supplierProductCode?: string;
    currentPrice?: string;
    leadTimeDays?: number;
  },
) {
  return db.transaction(async (tx) => {
    const now = new Date();

    if (data.currentPrice !== undefined) {
      const [currentPrice] = await tx
        .select()
        .from(vendorProductPrices)
        .where(
          and(
            eq(vendorProductPrices.vendorProductId, id),
            isNull(vendorProductPrices.effectiveTo),
          ),
        )
        .limit(1);

      if (!currentPrice) {
        throw new Error("Current vendor product price not found");
      }

      if (currentPrice.price !== data.currentPrice) {
        await tx
          .update(vendorProductPrices)
          .set({
            effectiveTo: now,
          })
          .where(eq(vendorProductPrices.id, currentPrice.id));

        await tx.insert(vendorProductPrices).values({
          vendorProductId: id,
          price: data.currentPrice,
          effectiveFrom: now,
        });
      }
    }

    const [vendorProduct] = await tx
      .update(vendorProducts)
      .set({
        ...data,
        updatedAt: now,
      })
      .where(eq(vendorProducts.id, id))
      .returning();

    return vendorProduct ?? null;
  });
}

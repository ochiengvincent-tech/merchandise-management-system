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

export async function updateVendorProductStatusWithDatabase<
  T extends Pick<typeof db, "update">,
>(id: string, status: "ACTIVE" | "INACTIVE", database: T) {
  const [vendorProduct] = await database
    .update(vendorProducts)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendorProducts.id, id))
    .returning();

  return vendorProduct ?? null;
}

export async function updateVendorProductWithPriceWithDatabase<
  T extends Pick<typeof db, "select" | "update" | "insert">,
>(
  id: string,
  data: {
    supplierProductCode?: string;
    currentPrice?: string;
    leadTimeDays?: number;
  },
  database: T,
) {
  const now = new Date();
  let previousPrice: string | undefined;
  let priceChanged = false;
  if (data.currentPrice !== undefined) {
    const [currentPrice] = await database
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
    previousPrice = currentPrice.price;
    if (currentPrice.price !== data.currentPrice) {
      priceChanged = true;
      await database
        .update(vendorProductPrices)
        .set({ effectiveTo: now })
        .where(eq(vendorProductPrices.id, currentPrice.id));
      await database.insert(vendorProductPrices).values({
        vendorProductId: id,
        price: data.currentPrice,
        effectiveFrom: now,
      });
    }
  }
  const [vendorProduct] = await database
    .update(vendorProducts)
    .set({ ...data, updatedAt: now })
    .where(eq(vendorProducts.id, id))
    .returning();
  return { vendorProduct: vendorProduct ?? null, priceChanged, previousPrice };
}

export async function createVendorProductWithPriceWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  vendorProductData: typeof vendorProducts.$inferInsert,
  price: string,
  effectiveFrom: Date,
  database: T,
) {
  const [vendorProduct] = await database
    .insert(vendorProducts)
    .values(vendorProductData)
    .returning();
  if (!vendorProduct) {
    throw new Error("Failed to create vendor product");
  }
  const [vendorProductPrice] = await database
    .insert(vendorProductPrices)
    .values({ vendorProductId: vendorProduct.id, price, effectiveFrom })
    .returning();
  if (!vendorProductPrice) {
    throw new Error("Failed to create vendor product price");
  }
  return { vendorProduct, vendorProductPrice };
}

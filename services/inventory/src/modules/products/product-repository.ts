import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { products } from "../../db/schema/products.js";

export const createProduct = async (
  data: typeof products.$inferInsert
) => {
  const [product] = await db
    .insert(products)
    .values(data)
    .returning();

  return product;
};

export const findProductById = async (id: string) => {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  return product ?? null;
};

export const findProductBySku = async (sku: string) => {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);

  return product ?? null;
};

export const findProducts = async (filters: {
  search?: string;
  status?: string;
  category?: string;
}) => {
  const conditions = [];

  if (filters.search) {
    conditions.push(
      or(
        ilike(products.sku, `%${filters.search}%`),
        ilike(products.name, `%${filters.search}%`)
      )
    );
  }

  if (filters.status) {
    conditions.push(eq(products.status, filters.status));
  }

  if (filters.category) {
    conditions.push(eq(products.category, filters.category));
  }

  return db
    .select()
    .from(products)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
};

export const updateProduct = async (
  id: string,
  data: Partial<typeof products.$inferInsert>
) => {
  const [product] = await db
    .update(products)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(products.id, id))
    .returning();

  return product ?? null;
};

export const updateProductStatus = async (
  id: string,
  status: "ACTIVE" | "INACTIVE"
) => {
  const [product] = await db
    .update(products)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(eq(products.id, id))
    .returning();

  return product ?? null;
};
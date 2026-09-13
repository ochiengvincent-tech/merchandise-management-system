import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vendors } from "../../db/schema/vendors.js";

export async function createVendor(data: typeof vendors.$inferInsert) {
  const [vendor] = await db.insert(vendors).values(data).returning();

  return vendor;
}
type Database = typeof db

export async function createVendorWithDatabase<
  T extends Pick<typeof db, "insert">,
>(
  data: typeof vendors.$inferInsert,
  database: T,
) {
  const [vendor] = await database
    .insert(vendors)
    .values(data)
    .returning();

  return vendor;
}

export async function findVendorById(id: string) {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);

  return vendor ?? null;
}

export async function findVendorByCode(vendorCode: string) {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(eq(vendors.vendorCode, vendorCode))
    .limit(1);

  return vendor ?? null;
}

export async function listVendors({
  page,
  limit,
  status,
  search,
}: {
  page: number;
  limit: number;
  status?: string | undefined;
  search?: string | undefined;
}) {
  const offset = (page - 1) * limit;

  const conditions = [];

  if (status) {
    conditions.push(eq(vendors.status, status));
  }

  if (search) {
    conditions.push(
      sql`(${ilike(vendors.vendorCode, `%${search}%`)} OR ${ilike(
        vendors.name,
        `%${search}%`,
      )})`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(vendors)
      .where(whereClause)
      .orderBy(desc(vendors.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(vendors)
      .where(whereClause),
  ]);

  return {
    data,
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function updateVendor(
  id: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  },
) {
  const [vendor] = await db
    .update(vendors)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  return vendor ?? null;
}

export async function updateVendorWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  },
  database: T,
) {
  const [vendor] = await database
    .update(vendors)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  return vendor ?? null;
}

export async function updateVendorStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE",
) {
  const [vendor] = await db
    .update(vendors)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  return vendor ?? null;
}
export async function updateVendorStatusWithDatabase<
  T extends Pick<typeof db, "update">,
>(
  id: string,
  status: "ACTIVE" | "INACTIVE",
  database: T,
) {
  const [vendor] = await database
    .update(vendors)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  return vendor ?? null;
}
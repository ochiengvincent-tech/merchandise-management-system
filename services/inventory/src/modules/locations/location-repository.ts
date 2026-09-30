import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryLocations } from "../../db/schema/inventory-locations.js";

const LOCATION_CODE_LOCK_KEYS = {
  WAREHOUSE: 81001,
  STORE: 81002,
} as const;

export const createLocation = async (
  data: typeof inventoryLocations.$inferInsert,
) => {
  const [location] = await db
    .insert(inventoryLocations)
    .values(data)
    .returning();

  return location;
};

export const createLocationWithGeneratedCode = async (
  data: Omit<typeof inventoryLocations.$inferInsert, "locationCode"> & {
    locationType: "WAREHOUSE" | "STORE";
  },
) => {
  return db.transaction(async (tx) => {
    const lockKey = LOCATION_CODE_LOCK_KEYS[data.locationType];

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const prefix = data.locationType === "WAREHOUSE" ? "WH" : "ST";

    const result = await tx.execute<{ next_number: number }>(
      sql`
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(${inventoryLocations.locationCode} FROM 4)
          AS INTEGER
        )
      ),
      0
    ) + 1 AS next_number
    FROM ${inventoryLocations}
    WHERE ${inventoryLocations.locationCode} ~ ${`^${prefix}-[0-9]+$`}
  `,
    );

    const nextNumber = Number(result.rows[0]?.next_number ?? 1);
    const locationCode = `${prefix}-${String(nextNumber).padStart(3, "0")}`;

    const [location] = await tx
      .insert(inventoryLocations)
      .values({
        ...data,
        locationCode,
      })
      .returning();

    return location;
  });
};

export const findLocationById = async (id: string) => {
  const [location] = await db
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.id, id))
    .limit(1);

  return location ?? null;
};

export const findLocationByIdWithDatabase = async <
  T extends Pick<typeof db, "select">,
>(
  id: string,
  database: T,
) => {
  const [location] = await database
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.id, id))
    .limit(1);

  return location ?? null;
};

export const findLocationByCode = async (locationCode: string) => {
  const [location] = await db
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.locationCode, locationCode))
    .limit(1);

  return location ?? null;
};

export const findLocations = async (filters: {
  search?: string;
  locationType?: string;
  status?: string;
}) => {
  const conditions = [];

  if (filters.search) {
    conditions.push(
      or(
        ilike(inventoryLocations.locationCode, `%${filters.search}%`),
        ilike(inventoryLocations.name, `%${filters.search}%`),
      ),
    );
  }

  if (filters.locationType) {
    conditions.push(eq(inventoryLocations.locationType, filters.locationType));
  }

  if (filters.status) {
    conditions.push(eq(inventoryLocations.status, filters.status));
  }

  return db
    .select()
    .from(inventoryLocations)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
};

export const updateLocation = async (
  id: string,
  data: Partial<typeof inventoryLocations.$inferInsert>,
) => {
  const [location] = await db
    .update(inventoryLocations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(inventoryLocations.id, id))
    .returning();

  return location ?? null;
};

export const updateLocationStatus = async (
  id: string,
  status: "ACTIVE" | "INACTIVE",
) => {
  const [location] = await db
    .update(inventoryLocations)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(inventoryLocations.id, id))
    .returning();

  return location ?? null;
};

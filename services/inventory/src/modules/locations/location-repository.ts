import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryLocations } from "../../db/schema/inventory-locations.js";

export const createLocation = async (
  data: typeof inventoryLocations.$inferInsert
) => {
  const [location] = await db
    .insert(inventoryLocations)
    .values(data)
    .returning();

  return location;
};

export const findLocationById = async (id: string) => {
  const [location] = await db
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
        ilike(
          inventoryLocations.locationCode,
          `%${filters.search}%`
        ),
        ilike(inventoryLocations.name, `%${filters.search}%`)
      )
    );
}


  if (filters.locationType) {
    conditions.push(
      eq(inventoryLocations.locationType, filters.locationType)
    );
  }

  if (filters.status) {
    conditions.push(eq(inventoryLocations.status, filters.status));
  }

  return db
    .select()
    .from(inventoryLocations)
    .where(
      conditions.length > 0 ? and(...conditions) : undefined
    );
};

export const updateLocation = async (
  id: string,
  data: Partial<typeof inventoryLocations.$inferInsert>
) => {
  const [location] = await db
    .update(inventoryLocations)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(inventoryLocations.id, id))
    .returning();

  return location ?? null;
};
export const updateLocationStatus = async (
  id: string,
  status: "ACTIVE" | "INACTIVE"
) => {
  const [location] = await db
    .update(inventoryLocations)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(eq(inventoryLocations.id, id))
    .returning();

  return location ?? null;
};

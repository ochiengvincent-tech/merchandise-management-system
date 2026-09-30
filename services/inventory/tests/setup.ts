import "dotenv/config";
import { sql } from "drizzle-orm";
import { beforeAll, afterAll, beforeEach } from "vitest";
import { assertTestDatabaseUrl } from "./database-safety.js";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mms_inventory:mms_inventory@localhost:5436/inventory_test_db";
process.env.RABBITMQ_URL ??= "amqp://localhost:5672";
process.env.RABBITMQ_QUEUE_PREFIX ??= "test.";
assertTestDatabaseUrl(process.env.DATABASE_URL);

const tableNames = [
  "inventory_outbox_events",
  "inventory_processed_events",
  "inventory_audit_logs",
  "inventory_adjustments",
  "inventory_stock",
  "inventory_locations",
  "products",
];

const resetDatabase = async () => {
  const { db } = await import("../src/db/index.js");
  await db.execute(
    sql.raw(
      `TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
  );
};

beforeAll(async () => {
  const { db } = await import("../src/db/index.js");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(resetDatabase);

afterAll(async () => {
  const { pool } = await import("../src/db/index.js");
  await pool.end();
});

import { asc, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db, pool } from "../../db/index.js";
import { warehouseOutboxEvents } from "../../db/schema/warehouse.js";
import { getRabbitMQChannel } from "./rabbitmq.js";

const EVENTS_EXCHANGE = "mms.events";
const OUTBOX_LOCK_KEY = "mms.warehouse-operations.outbox.publisher";
const MAX_ATTEMPTS = 5;
const PUBLISH_TIMEOUT_MS = 5_000;
let isPublishing = false;

export async function publishPendingWarehouseEvents() {
  if (isPublishing) return;
  isPublishing = true;
  let client: PoolClient | null = null;
  let locked = false;
  try {
    client = await pool.connect();
    const lockResult = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [OUTBOX_LOCK_KEY],
    );
    locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) return;

    const pending = await db.select().from(warehouseOutboxEvents)
      .where(eq(warehouseOutboxEvents.status, "PENDING"))
      .orderBy(asc(warehouseOutboxEvents.occurredAt))
      .limit(50);
    if (!pending.length) return;
    const channel = await getRabbitMQChannel();

    for (const event of pending) {
      if (event.attempts >= MAX_ATTEMPTS) {
        await db.update(warehouseOutboxEvents).set({ status: "FAILED" }).where(eq(warehouseOutboxEvents.id, event.id));
        continue;
      }
      try {
        channel.publish(EVENTS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          occurredAt: event.occurredAt,
        })), { persistent: true, contentType: "application/json", messageId: event.eventId });
        await Promise.race([
          channel.waitForConfirms(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RabbitMQ publish confirmation timed out")), PUBLISH_TIMEOUT_MS)),
        ]);
        await db.update(warehouseOutboxEvents).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(warehouseOutboxEvents.id, event.id));
      } catch (error) {
        const [updated] = await db.update(warehouseOutboxEvents)
          .set({ attempts: sql`${warehouseOutboxEvents.attempts} + 1` })
          .where(eq(warehouseOutboxEvents.id, event.id)).returning({ attempts: warehouseOutboxEvents.attempts });
        if ((updated?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS) {
          await db.update(warehouseOutboxEvents).set({ status: "FAILED" }).where(eq(warehouseOutboxEvents.id, event.id));
        }
        console.error(`Could not publish Warehouse event ${event.eventId}:`, error);
        break;
      }
    }
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [OUTBOX_LOCK_KEY]).catch(() => undefined);
      client.release();
    }
    isPublishing = false;
  }
}

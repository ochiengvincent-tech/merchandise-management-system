import { asc, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db, pool } from "../../db/index.js";
import { retailOutboxEvents } from "../../db/schema/index.js";
import { getRabbitMQChannel, EVENTS_EXCHANGE } from "./rabbitmq.js";
const LOCK_KEY = "mms.retail-sales.outbox.publisher";
let publishing = false;
export async function publishPendingRetailEvents() {
  if (publishing) return;
  publishing = true;
  let client: PoolClient | null = null; let locked = false;
  try {
    client = await pool.connect();
    locked = Boolean((await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [LOCK_KEY])).rows[0]?.locked);
    if (!locked) return;
    const events = await db.select().from(retailOutboxEvents).where(eq(retailOutboxEvents.status, "PENDING")).orderBy(asc(retailOutboxEvents.occurredAt)).limit(50);
    if (!events.length) return;
    const channel = await getRabbitMQChannel();
    for (const event of events) {
      if (event.attempts >= 10) { await db.update(retailOutboxEvents).set({ status: "FAILED" }).where(eq(retailOutboxEvents.id, event.id)); continue; }
      try {
        channel.publish(EVENTS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify({ eventId: event.eventId, eventType: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId, payload: event.payload, occurredAt: event.occurredAt })), { persistent: true, contentType: "application/json", messageId: event.eventId });
        await channel.waitForConfirms();
        await db.update(retailOutboxEvents).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(retailOutboxEvents.id, event.id));
      } catch (error) {
        const [updated] = await db.update(retailOutboxEvents).set({ attempts: sql`${retailOutboxEvents.attempts} + 1` }).where(eq(retailOutboxEvents.id, event.id)).returning({ attempts: retailOutboxEvents.attempts });
        if ((updated?.attempts ?? 10) >= 10) await db.update(retailOutboxEvents).set({ status: "FAILED" }).where(eq(retailOutboxEvents.id, event.id));
        console.error(`Retail Sales could not publish event ${event.eventId}:`, error); break;
      }
    }
  } finally {
    if (client) { if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined); client.release(); }
    publishing = false;
  }
}

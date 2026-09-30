CREATE TABLE "inventory_sale_reservations" (
  "id" uuid PRIMARY KEY,
  "idempotency_key" uuid NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "sale_id" uuid NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "location_id" uuid NOT NULL REFERENCES "inventory_locations"("id"),
  "quantity" integer NOT NULL,
  "actor_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'RESERVED' NOT NULL,
  "consumed_by_event_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_sale_reservations_idempotency_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "inventory_sale_reservations_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_sale_reservations_status_check" CHECK ("status" IN ('RESERVED', 'CONSUMED', 'RELEASED'))
);
--> statement-breakpoint
CREATE INDEX "inventory_sale_reservations_sale_idx" ON "inventory_sale_reservations" USING btree ("sale_id");

CREATE TABLE "inventory_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_outbox_status_check" CHECK ("inventory_outbox_events"."status" IN ('PENDING', 'PUBLISHED', 'FAILED')),
	CONSTRAINT "inventory_outbox_attempts_check" CHECK ("inventory_outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_outbox_event_id_unique" ON "inventory_outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "inventory_outbox_status_index" ON "inventory_outbox_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_outbox_event_type_index" ON "inventory_outbox_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "inventory_outbox_aggregate_id_index" ON "inventory_outbox_events" USING btree ("aggregate_id");
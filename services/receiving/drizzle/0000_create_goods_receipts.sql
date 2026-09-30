CREATE TABLE IF NOT EXISTS "goods_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"grn_number" varchar(50) NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"supplier_delivery_note" varchar(100),
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"procurement_sync_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"procurement_sync_error" text,
	"request_hash" varchar(64) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_grn_number_unique" UNIQUE("grn_number"),
	CONSTRAINT "goods_receipts_procurement_sync_status_check" CHECK ("procurement_sync_status" IN ('PENDING', 'SYNCED', 'RETRYING'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_purchase_order_id_idx" ON "goods_receipts" USING btree ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_sync_status_idx" ON "goods_receipts" USING btree ("procurement_sync_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"product_id" uuid NOT NULL,
	"product_code" varchar(100) NOT NULL,
	"product_name" varchar(255),
	"quantity_expected_at_receipt" integer DEFAULT 0 NOT NULL,
	"quantity_observed" integer NOT NULL,
	"quantity_damaged" integer DEFAULT 0 NOT NULL,
	"quantity_accepted" integer NOT NULL,
	"condition" varchar(20) NOT NULL,
	"discrepancies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	CONSTRAINT "goods_receipt_lines_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE cascade,
	CONSTRAINT "goods_receipt_lines_expected_non_negative" CHECK ("quantity_expected_at_receipt" >= 0),
	CONSTRAINT "goods_receipt_lines_observed_non_negative" CHECK ("quantity_observed" >= 0),
	CONSTRAINT "goods_receipt_lines_damaged_non_negative" CHECK ("quantity_damaged" >= 0 AND "quantity_damaged" <= "quantity_observed"),
	CONSTRAINT "goods_receipt_lines_accepted_non_negative" CHECK ("quantity_accepted" >= 0 AND "quantity_accepted" <= "quantity_observed" - "quantity_damaged"),
	CONSTRAINT "goods_receipt_lines_condition_check" CHECK ("condition" IN ('GOOD', 'DAMAGED', 'MIXED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_goods_receipt_id_idx" ON "goods_receipt_lines" USING btree ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_purchase_order_line_id_idx" ON "goods_receipt_lines" USING btree ("purchase_order_line_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receiving_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receiving_audit_logs_goods_receipt_id_idx" ON "receiving_audit_logs" USING btree ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receiving_audit_logs_created_at_idx" ON "receiving_audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receiving_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "receiving_outbox_events_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "receiving_outbox_events_attempts_non_negative" CHECK ("attempts" >= 0),
	CONSTRAINT "receiving_outbox_events_status_check" CHECK ("status" IN ('PENDING', 'PUBLISHED', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receiving_outbox_events_status_idx" ON "receiving_outbox_events" USING btree ("status");

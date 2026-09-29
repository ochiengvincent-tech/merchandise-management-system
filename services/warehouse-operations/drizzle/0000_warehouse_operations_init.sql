CREATE TABLE "warehouse_adjustment_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"location_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"source_bin_id" uuid NOT NULL,
	"quantity_change" integer NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"reason" varchar(255) NOT NULL,
	"actor_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"inventory_adjustment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_adjustment_commands_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "warehouse_adjustment_commands_nonzero_check" CHECK ("warehouse_adjustment_commands"."quantity_change" <> 0),
	CONSTRAINT "warehouse_adjustment_commands_reserved_check" CHECK ("warehouse_adjustment_commands"."reserved_quantity" >= 0),
	CONSTRAINT "warehouse_adjustment_commands_status_check" CHECK ("warehouse_adjustment_commands"."status" IN ('PENDING', 'SYNCED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "warehouse_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_id" uuid NOT NULL,
	"location_id" uuid,
	"bin_id" uuid,
	"movement_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_bin_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bin_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"disposition" varchar(20) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_bin_balances_bin_product_disposition_unique" UNIQUE("bin_id","product_id","disposition"),
	CONSTRAINT "warehouse_bin_balances_disposition_check" CHECK ("warehouse_bin_balances"."disposition" IN ('SELLABLE', 'QUARANTINED', 'DISCREPANCY')),
	CONSTRAINT "warehouse_bin_balances_quantity_check" CHECK ("warehouse_bin_balances"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_bins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"bin_type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"system_managed" boolean DEFAULT false NOT NULL,
	"zone" varchar(100),
	"aisle" varchar(50),
	"rack" varchar(50),
	"shelf" varchar(50),
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_bins_location_code_unique" UNIQUE("location_id","code"),
	CONSTRAINT "warehouse_bins_type_check" CHECK ("warehouse_bins"."bin_type" IN ('RECEIVING', 'STORAGE', 'PICK_FACE', 'QUARANTINE', 'DISCREPANCY', 'UNASSIGNED')),
	CONSTRAINT "warehouse_bins_status_check" CHECK ("warehouse_bins"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "warehouse_bins_capacity_check" CHECK ("warehouse_bins"."capacity" IS NULL OR "warehouse_bins"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"movement_type" varchar(30) NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"disposition" varchar(20) NOT NULL,
	"source_bin_id" uuid,
	"destination_bin_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"reference_type" varchar(50) NOT NULL,
	"reference_id" uuid,
	"task_line_id" uuid,
	"actor_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_movements_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "warehouse_movements_type_check" CHECK ("warehouse_movements"."movement_type" IN ('OPENING_BALANCE', 'PUTAWAY', 'BIN_TRANSFER', 'QUARANTINE_TRANSFER', 'INVENTORY_ADJUSTMENT')),
	CONSTRAINT "warehouse_movements_quantity_check" CHECK ("warehouse_movements"."quantity" > 0),
	CONSTRAINT "warehouse_movements_disposition_check" CHECK ("warehouse_movements"."disposition" IN ('SELLABLE', 'QUARANTINED', 'DISCREPANCY'))
);
--> statement-breakpoint
CREATE TABLE "warehouse_outbox_events" (
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
	CONSTRAINT "warehouse_outbox_events_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "warehouse_outbox_attempts_check" CHECK ("warehouse_outbox_events"."attempts" >= 0),
	CONSTRAINT "warehouse_outbox_status_check" CHECK ("warehouse_outbox_events"."status" IN ('PENDING', 'PUBLISHED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "warehouse_processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_putaway_task_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"receipt_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_accepted" integer NOT NULL,
	"quantity_placed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "warehouse_putaway_task_lines_task_receipt_line_unique" UNIQUE("task_id","receipt_line_id"),
	CONSTRAINT "warehouse_putaway_task_lines_quantities_check" CHECK ("warehouse_putaway_task_lines"."quantity_accepted" > 0 AND "warehouse_putaway_task_lines"."quantity_placed" >= 0 AND "warehouse_putaway_task_lines"."quantity_placed" <= "warehouse_putaway_task_lines"."quantity_accepted")
);
--> statement-breakpoint
CREATE TABLE "warehouse_putaway_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_putaway_tasks_goods_receipt_id_unique" UNIQUE("goods_receipt_id"),
	CONSTRAINT "warehouse_putaway_tasks_status_check" CHECK ("warehouse_putaway_tasks"."status" IN ('OPEN', 'IN_PROGRESS', 'COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "warehouse_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"line_index" integer NOT NULL,
	"purchase_order_line_id" uuid,
	"product_id" uuid NOT NULL,
	"quantity_observed" integer NOT NULL,
	"quantity_damaged" integer NOT NULL,
	"quantity_accepted" integer NOT NULL,
	"quantity_discrepancy" integer NOT NULL,
	CONSTRAINT "warehouse_receipt_lines_receipt_index_unique" UNIQUE("goods_receipt_id","line_index"),
	CONSTRAINT "warehouse_receipt_lines_quantities_non_negative" CHECK ("warehouse_receipt_lines"."quantity_observed" >= 0 AND "warehouse_receipt_lines"."quantity_damaged" >= 0 AND "warehouse_receipt_lines"."quantity_accepted" >= 0 AND "warehouse_receipt_lines"."quantity_discrepancy" >= 0),
	CONSTRAINT "warehouse_receipt_lines_damaged_observed_check" CHECK ("warehouse_receipt_lines"."quantity_damaged" <= "warehouse_receipt_lines"."quantity_observed")
);
--> statement-breakpoint
CREATE TABLE "warehouse_receipts" (
	"goods_receipt_id" uuid PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"grn_number" varchar(50) NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_receipts_source_event_id_unique" UNIQUE("source_event_id")
);
--> statement-breakpoint
ALTER TABLE "warehouse_adjustment_commands" ADD CONSTRAINT "warehouse_adjustment_commands_source_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("source_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_bin_balances" ADD CONSTRAINT "warehouse_bin_balances_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_source_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("source_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_destination_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("destination_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_task_line_id_warehouse_putaway_task_lines_id_fk" FOREIGN KEY ("task_line_id") REFERENCES "public"."warehouse_putaway_task_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_putaway_task_lines" ADD CONSTRAINT "warehouse_putaway_task_lines_task_id_warehouse_putaway_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."warehouse_putaway_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_putaway_task_lines" ADD CONSTRAINT "warehouse_putaway_task_lines_receipt_line_id_warehouse_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."warehouse_receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_putaway_tasks" ADD CONSTRAINT "warehouse_putaway_tasks_goods_receipt_id_warehouse_receipts_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."warehouse_receipts"("goods_receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_receipt_lines" ADD CONSTRAINT "warehouse_receipt_lines_goods_receipt_id_warehouse_receipts_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."warehouse_receipts"("goods_receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warehouse_adjustment_commands_status_idx" ON "warehouse_adjustment_commands" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warehouse_audit_logs_created_idx" ON "warehouse_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_bin_balances_product_id_idx" ON "warehouse_bin_balances" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "warehouse_bins_location_id_idx" ON "warehouse_bins" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "warehouse_movements_location_created_idx" ON "warehouse_movements" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_movements_product_created_idx" ON "warehouse_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_outbox_status_idx" ON "warehouse_outbox_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warehouse_putaway_tasks_location_status_idx" ON "warehouse_putaway_tasks" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "warehouse_receipts_location_received_idx" ON "warehouse_receipts" USING btree ("location_id","received_at");
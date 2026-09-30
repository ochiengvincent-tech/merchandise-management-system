CREATE TABLE "retail_registers" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"code" varchar(50) NOT NULL,"name" varchar(150) NOT NULL,"inventory_location_id" uuid NOT NULL,"active" varchar(10) DEFAULT 'ACTIVE' NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,CONSTRAINT "retail_registers_code_unique" UNIQUE("code"),CONSTRAINT "retail_registers_active_check" CHECK ("active" IN ('ACTIVE','INACTIVE')));
--> statement-breakpoint
CREATE TABLE "retail_prices" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"product_id" uuid NOT NULL,"amount_minor" integer NOT NULL,"currency" varchar(3) DEFAULT 'KES' NOT NULL,"tax_rate_bps" integer DEFAULT 0 NOT NULL,"effective_from" timestamptz NOT NULL,"effective_to" timestamptz,"created_by" uuid NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,CONSTRAINT "retail_prices_amount_check" CHECK ("amount_minor">=0),CONSTRAINT "retail_prices_tax_check" CHECK ("tax_rate_bps">=0 AND "tax_rate_bps"<=10000),CONSTRAINT "retail_prices_window_check" CHECK ("effective_to" IS NULL OR "effective_to">"effective_from"));
--> statement-breakpoint
CREATE INDEX "retail_prices_product_effective_idx" ON "retail_prices" ("product_id","effective_from");
--> statement-breakpoint
CREATE TABLE "retail_sales" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"receipt_number" varchar(50) NOT NULL,"register_id" uuid NOT NULL REFERENCES "retail_registers"("id"),"inventory_location_id" uuid NOT NULL,"warehouse_managed" boolean DEFAULT false NOT NULL,"actor_id" uuid NOT NULL,"status" varchar(20) DEFAULT 'PENDING' NOT NULL,"currency" varchar(3) DEFAULT 'KES' NOT NULL,"subtotal_minor" integer,"tax_minor" integer,"total_minor" integer,"idempotency_key" uuid NOT NULL,"request_hash" varchar(64) NOT NULL,"reservation_plan" jsonb NOT NULL,"failure_message" varchar(500),"created_at" timestamptz DEFAULT now() NOT NULL,"completed_at" timestamptz,CONSTRAINT "retail_sales_receipt_unique" UNIQUE("receipt_number"),CONSTRAINT "retail_sales_idempotency_unique" UNIQUE("idempotency_key"),CONSTRAINT "retail_sales_status_check" CHECK ("status" IN ('PENDING','COMPLETED','FAILED')));
--> statement-breakpoint
CREATE INDEX "retail_sales_register_created_idx" ON "retail_sales" ("register_id","created_at");
--> statement-breakpoint
CREATE TABLE "retail_sale_lines" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"sale_id" uuid NOT NULL REFERENCES "retail_sales"("id") ON DELETE CASCADE,"product_id" uuid NOT NULL,"reservation_id" uuid NOT NULL,"sku_snapshot" varchar(100) NOT NULL,"name_snapshot" varchar(255) NOT NULL,"quantity" integer NOT NULL,"unit_price_minor" integer NOT NULL,"tax_rate_bps" integer NOT NULL,"tax_minor" integer NOT NULL,"line_total_minor" integer NOT NULL,CONSTRAINT "retail_sale_lines_qty_check" CHECK ("quantity">0));
--> statement-breakpoint
CREATE INDEX "retail_sale_lines_sale_idx" ON "retail_sale_lines" ("sale_id");
--> statement-breakpoint
CREATE TABLE "retail_tenders" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"sale_id" uuid NOT NULL REFERENCES "retail_sales"("id") ON DELETE CASCADE,"method" varchar(20) NOT NULL,"amount_minor" integer NOT NULL,"currency" varchar(3) NOT NULL,"reference" varchar(150),"status" varchar(20) DEFAULT 'RECORDED' NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,CONSTRAINT "retail_tenders_method_check" CHECK ("method" IN ('CASH','CARD','GIFT_CARD')),CONSTRAINT "retail_tenders_amount_check" CHECK ("amount_minor">0),CONSTRAINT "retail_tenders_status_check" CHECK ("status"='RECORDED'));
--> statement-breakpoint
CREATE TABLE "retail_audit_logs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"action" varchar(100) NOT NULL,"actor_id" uuid NOT NULL,"record_id" uuid NOT NULL,"details" jsonb DEFAULT '{}'::jsonb NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE INDEX "retail_audit_record_idx" ON "retail_audit_logs" ("record_id");
--> statement-breakpoint
CREATE INDEX "retail_audit_created_idx" ON "retail_audit_logs" ("created_at");
--> statement-breakpoint
CREATE TABLE "retail_outbox_events" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"event_id" uuid NOT NULL,"event_type" varchar(100) NOT NULL,"aggregate_type" varchar(100) NOT NULL,"aggregate_id" uuid NOT NULL,"payload" jsonb NOT NULL,"status" varchar(20) DEFAULT 'PENDING' NOT NULL,"attempts" integer DEFAULT 0 NOT NULL,"occurred_at" timestamptz DEFAULT now() NOT NULL,"published_at" timestamptz,CONSTRAINT "retail_outbox_event_unique" UNIQUE("event_id"),CONSTRAINT "retail_outbox_attempts_check" CHECK ("attempts">=0),CONSTRAINT "retail_outbox_status_check" CHECK ("status" IN ('PENDING','PUBLISHED','FAILED')));
--> statement-breakpoint
CREATE INDEX "retail_outbox_status_idx" ON "retail_outbox_events" ("status");
--> statement-breakpoint
CREATE TABLE "retail_processed_events" ("event_id" uuid PRIMARY KEY,"event_type" varchar(100) NOT NULL,"processed_at" timestamptz DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "retail_returns" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"return_number" varchar(50) NOT NULL,"sale_id" uuid NOT NULL REFERENCES "retail_sales"("id"),"actor_id" uuid NOT NULL,"reason" varchar(255) NOT NULL,"status" varchar(20) DEFAULT 'RECORDED' NOT NULL,"total_refund_minor" integer NOT NULL,"idempotency_key" uuid NOT NULL,"request_hash" varchar(64) NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,CONSTRAINT "retail_returns_number_unique" UNIQUE("return_number"),CONSTRAINT "retail_returns_idempotency_unique" UNIQUE("idempotency_key"),CONSTRAINT "retail_returns_status_check" CHECK ("status"='RECORDED'),CONSTRAINT "retail_returns_total_check" CHECK ("total_refund_minor">=0));
--> statement-breakpoint
CREATE INDEX "retail_returns_sale_idx" ON "retail_returns" ("sale_id");
--> statement-breakpoint
CREATE TABLE "retail_return_lines" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"return_id" uuid NOT NULL REFERENCES "retail_returns"("id") ON DELETE CASCADE,"sale_line_id" uuid NOT NULL REFERENCES "retail_sale_lines"("id"),"product_id" uuid NOT NULL,"quantity" integer NOT NULL,"refund_minor" integer NOT NULL,"disposition" varchar(24) NOT NULL,CONSTRAINT "retail_return_lines_quantity_check" CHECK ("quantity">0),CONSTRAINT "retail_return_lines_disposition_check" CHECK ("disposition" IN ('RESTOCK_SELLABLE','QUARANTINE','NO_STOCK_RETURN')));
--> statement-breakpoint
CREATE INDEX "retail_return_lines_sale_line_idx" ON "retail_return_lines" ("sale_line_id");
--> statement-breakpoint
CREATE TABLE "retail_return_tenders" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"return_id" uuid NOT NULL REFERENCES "retail_returns"("id") ON DELETE CASCADE,"method" varchar(20) NOT NULL,"amount_minor" integer NOT NULL,"reference" varchar(150),"status" varchar(20) DEFAULT 'RECORDED' NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,CONSTRAINT "retail_return_tenders_method_check" CHECK ("method" IN ('CASH','CARD','GIFT_CARD')),CONSTRAINT "retail_return_tenders_amount_check" CHECK ("amount_minor">0),CONSTRAINT "retail_return_tenders_status_check" CHECK ("status"='RECORDED'));

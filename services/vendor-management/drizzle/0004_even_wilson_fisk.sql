CREATE TABLE "vendor_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid,
	"vendor_product_id" uuid,
	"action" varchar(50) NOT NULL,
	"actor_id" uuid NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_audit_logs" ADD CONSTRAINT "vendor_audit_logs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_audit_logs" ADD CONSTRAINT "vendor_audit_logs_vendor_product_id_vendor_products_id_fk" FOREIGN KEY ("vendor_product_id") REFERENCES "public"."vendor_products"("id") ON DELETE no action ON UPDATE no action;
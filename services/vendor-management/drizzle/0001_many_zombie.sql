CREATE TABLE "vendor_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_product_code" varchar(100),
	"current_price" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'KES' NOT NULL,
	"lead_time_days" integer NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_products_price_check" CHECK ("vendor_products"."current_price" >= 0),
	CONSTRAINT "vendor_products_lead_time_check" CHECK ("vendor_products"."lead_time_days" >= 0),
	CONSTRAINT "vendor_products_status_check" CHECK ("vendor_products"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
ALTER TABLE "vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
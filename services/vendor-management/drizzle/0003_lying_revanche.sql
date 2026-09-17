CREATE TABLE "vendor_product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_product_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_product_prices_price_check" CHECK ("vendor_product_prices"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "vendor_product_prices" ADD CONSTRAINT "vendor_product_prices_vendor_product_id_vendor_products_id_fk" FOREIGN KEY ("vendor_product_id") REFERENCES "public"."vendor_products"("id") ON DELETE no action ON UPDATE no action;
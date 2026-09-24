CREATE TABLE "reorder_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_on_hand" integer NOT NULL,
	"quantity_allocated" integer NOT NULL,
	"quantity_available" integer NOT NULL,
	"reorder_level" integer NOT NULL,
	"suggested_quantity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reorder_suggestions_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "reorder_suggestions_quantities_nonnegative" CHECK ("reorder_suggestions"."quantity_on_hand" >= 0
        AND "reorder_suggestions"."quantity_allocated" >= 0
        AND "reorder_suggestions"."quantity_available" >= 0
        AND "reorder_suggestions"."reorder_level" >= 0
        AND "reorder_suggestions"."suggested_quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reorder_suggestions_pending_product_location_idx" ON "reorder_suggestions" USING btree ("product_id","location_id") WHERE "reorder_suggestions"."status" = 'PENDING';
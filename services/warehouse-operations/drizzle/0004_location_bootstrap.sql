CREATE TABLE "warehouse_bootstraps" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"source_stock_count" integer NOT NULL,
	"source_total_units" integer NOT NULL,
	"variance_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'COMPLETED' NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_bootstraps_status_check" CHECK ("warehouse_bootstraps"."status" IN ('COMPLETED')),
	CONSTRAINT "warehouse_bootstraps_nonnegative_check" CHECK ("warehouse_bootstraps"."source_stock_count" >= 0 AND "warehouse_bootstraps"."source_total_units" >= 0 AND "warehouse_bootstraps"."variance_count" >= 0)
);

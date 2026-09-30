CREATE TABLE "vendor_reliability_orders" (
  "purchase_order_id" uuid PRIMARY KEY NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "po_number" varchar(50) NOT NULL,
  "sent_at" timestamptz NOT NULL,
  "due_at" timestamptz,
  "lines" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'OPEN',
  "ordered_units" integer NOT NULL,
  "observed_units" integer NOT NULL DEFAULT 0,
  "accepted_units" integer NOT NULL DEFAULT 0,
  "damaged_units" integer NOT NULL DEFAULT 0,
  "accepted_on_time_units" integer NOT NULL DEFAULT 0,
  "on_time_rate" integer NOT NULL DEFAULT 0,
  "fulfillment_rate" integer NOT NULL DEFAULT 0,
  "quality_rate" integer NOT NULL DEFAULT 0,
  "score" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vendor_reliability_orders_status_check" CHECK ("status" IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT "vendor_reliability_orders_units_non_negative" CHECK ("ordered_units" > 0 AND "observed_units" >= 0 AND "accepted_units" >= 0 AND "damaged_units" >= 0 AND "accepted_on_time_units" >= 0),
  CONSTRAINT "vendor_reliability_orders_rates_range" CHECK ("on_time_rate" BETWEEN 0 AND 100 AND "fulfillment_rate" BETWEEN 0 AND 100 AND "quality_rate" BETWEEN 0 AND 100 AND "score" BETWEEN 0 AND 100)
);

CREATE INDEX "vendor_reliability_orders_vendor_id_idx" ON "vendor_reliability_orders" ("vendor_id");
CREATE INDEX "vendor_reliability_orders_sent_at_idx" ON "vendor_reliability_orders" ("sent_at");

CREATE TABLE "vendor_reliability_receipts" (
  "goods_receipt_id" uuid PRIMARY KEY NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
  "received_at" timestamptz NOT NULL,
  "lines" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "vendor_reliability_receipts_po_id_idx" ON "vendor_reliability_receipts" ("purchase_order_id");
CREATE INDEX "vendor_reliability_receipts_vendor_id_idx" ON "vendor_reliability_receipts" ("vendor_id");

CREATE TABLE "vendor_reliability_summaries" (
  "vendor_id" uuid PRIMARY KEY NOT NULL REFERENCES "vendors"("id"),
  "score" integer NOT NULL,
  "on_time_rate" integer NOT NULL,
  "fulfillment_rate" integer NOT NULL,
  "quality_rate" integer NOT NULL,
  "eligible_purchase_orders" integer NOT NULL,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "formula_version" varchar(20) NOT NULL DEFAULT 'v1',
  "calculated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vendor_reliability_summaries_score_range" CHECK ("score" BETWEEN 0 AND 100 AND "on_time_rate" BETWEEN 0 AND 100 AND "fulfillment_rate" BETWEEN 0 AND 100 AND "quality_rate" BETWEEN 0 AND 100),
  CONSTRAINT "vendor_reliability_summaries_po_count_non_negative" CHECK ("eligible_purchase_orders" >= 0)
);

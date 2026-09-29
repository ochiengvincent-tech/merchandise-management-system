CREATE TABLE "sales_audit_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "register_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "register_code" varchar(50) NOT NULL,
  "register_name" varchar(150) NOT NULL,
  "currency" varchar(3) DEFAULT 'KES' NOT NULL,
  "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
  "opened_at" timestamptz DEFAULT now() NOT NULL,
  "closed_at" timestamptz,
  "opened_by" uuid NOT NULL,
  "opening_float_minor" integer DEFAULT 0 NOT NULL,
  "open_idempotency_key" uuid NOT NULL UNIQUE,
  "open_request_hash" varchar(64) NOT NULL,
  "reconciliation_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "last_snapshot_at" timestamptz,
  "last_reconciliation_details" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sales_audit_sessions_status_check" CHECK ("status" IN ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXCEPTION')),
  CONSTRAINT "sales_audit_sessions_reconciliation_check" CHECK ("reconciliation_status" IN ('PENDING', 'MATCHED', 'MISMATCH', 'UNAVAILABLE')),
  CONSTRAINT "sales_audit_sessions_opening_float_check" CHECK ("opening_float_minor" >= 0)
);
CREATE INDEX "sales_audit_sessions_register_opened_idx" ON "sales_audit_sessions" ("register_id", "opened_at");
CREATE INDEX "sales_audit_sessions_status_opened_idx" ON "sales_audit_sessions" ("status", "opened_at");
CREATE UNIQUE INDEX "sales_audit_sessions_active_register_unique" ON "sales_audit_sessions" ("register_id") WHERE "status" IN ('OPEN', 'SUBMITTED', 'REJECTED', 'EXCEPTION');

CREATE TABLE "sales_audit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_event_id" uuid NOT NULL UNIQUE,
  "source_event_type" varchar(50) NOT NULL,
  "transaction_id" uuid NOT NULL,
  "original_sale_id" uuid,
  "receipt_number" varchar(50),
  "register_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "currency" varchar(3) NOT NULL,
  "direction" varchar(10) NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "processed_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sales_audit_transactions_direction_check" CHECK ("direction" IN ('SALE', 'REFUND')),
  CONSTRAINT "sales_audit_transactions_type_id_unique" UNIQUE ("direction", "transaction_id")
);
CREATE INDEX "sales_audit_transactions_register_time_idx" ON "sales_audit_transactions" ("register_id", "occurred_at");

CREATE TABLE "sales_audit_transaction_tenders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_record_id" uuid NOT NULL REFERENCES "sales_audit_transactions"("id") ON DELETE CASCADE,
  "source_tender_id" varchar(100) NOT NULL,
  "method" varchar(20) NOT NULL,
  "amount_minor" integer NOT NULL,
  "outcome" varchar(20) DEFAULT 'RECORDED' NOT NULL,
  CONSTRAINT "sales_audit_transaction_tenders_source_unique" UNIQUE ("transaction_record_id", "source_tender_id"),
  CONSTRAINT "sales_audit_transaction_tenders_method_check" CHECK ("method" IN ('CASH', 'CARD', 'GIFT_CARD')),
  CONSTRAINT "sales_audit_transaction_tenders_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "sales_audit_transaction_tenders_outcome_check" CHECK ("outcome" IN ('RECORDED', 'SUCCEEDED'))
);

CREATE TABLE "sales_audit_close_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sales_audit_sessions"("id"),
  "submission_number" integer NOT NULL,
  "idempotency_key" uuid NOT NULL UNIQUE,
  "request_hash" varchar(64) NOT NULL,
  "submitted_by" uuid NOT NULL,
  "closed_at" timestamptz NOT NULL,
  "counted_totals" jsonb NOT NULL,
  "variance_explanations" jsonb NOT NULL,
  "reconciliation_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "source_snapshot_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sales_audit_close_submissions_session_number_unique" UNIQUE ("session_id", "submission_number"),
  CONSTRAINT "sales_audit_close_submissions_number_check" CHECK ("submission_number" > 0),
  CONSTRAINT "sales_audit_close_submissions_reconciliation_check" CHECK ("reconciliation_status" IN ('PENDING', 'MATCHED', 'MISMATCH', 'UNAVAILABLE'))
);
CREATE INDEX "sales_audit_close_submissions_session_idx" ON "sales_audit_close_submissions" ("session_id", "created_at");

CREATE TABLE "sales_audit_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sales_audit_sessions"("id"),
  "submission_id" uuid NOT NULL REFERENCES "sales_audit_close_submissions"("id"),
  "action" varchar(20) NOT NULL,
  "actor_id" uuid NOT NULL,
  "reason" varchar(500),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sales_audit_decisions_action_check" CHECK ("action" IN ('APPROVED', 'REJECTED'))
);
CREATE INDEX "sales_audit_decisions_session_created_idx" ON "sales_audit_decisions" ("session_id", "created_at");

CREATE TABLE "sales_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid,
  "action" varchar(100) NOT NULL,
  "actor_id" uuid NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "sales_audit_logs_session_created_idx" ON "sales_audit_logs" ("session_id", "created_at");

CREATE TABLE "sales_audit_processed_events" (
  "event_id" uuid PRIMARY KEY NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "processed_at" timestamptz DEFAULT now() NOT NULL
);

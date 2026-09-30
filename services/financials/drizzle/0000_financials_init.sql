CREATE TABLE "financial_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(30) NOT NULL UNIQUE,
  "name" varchar(150) NOT NULL,
  "account_type" varchar(20) NOT NULL,
  "normal_balance" varchar(6) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'KES',
  "parent_code" varchar(30),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "financial_accounts_type_check" CHECK ("account_type" IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  CONSTRAINT "financial_accounts_normal_balance_check" CHECK ("normal_balance" IN ('DEBIT','CREDIT'))
);
CREATE TABLE "financial_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "period_key" varchar(7) NOT NULL UNIQUE,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'OPEN',
  "closed_by" uuid,
  "closed_at" timestamptz,
  "reopened_by" uuid,
  "reopened_at" timestamptz,
  "reopen_reason" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "financial_periods_status_check" CHECK ("status" IN ('OPEN','CLOSED')),
  CONSTRAINT "financial_periods_date_check" CHECK ("ends_on" > "starts_on")
);
CREATE TABLE "financial_journals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_number" varchar(40) NOT NULL UNIQUE,
  "source_type" varchar(50) NOT NULL,
  "source_id" uuid,
  "source_event_id" uuid,
  "posting_rule_version" integer NOT NULL DEFAULT 1,
  "period_id" uuid NOT NULL REFERENCES "financial_periods"("id"),
  "accounting_date" date NOT NULL,
  "currency" varchar(3) NOT NULL,
  "description" varchar(500) NOT NULL,
  "actor_id" uuid,
  "reversal_of_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "financial_journals_source_event_rule_unique" UNIQUE ("source_event_id", "posting_rule_version"),
  CONSTRAINT "financial_journals_reversal_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "financial_journals"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "financial_journals_reversal_unique" ON "financial_journals" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE INDEX "financial_journals_date_idx" ON "financial_journals" ("accounting_date", "id");
CREATE INDEX "financial_journals_source_idx" ON "financial_journals" ("source_type", "source_id");
CREATE TABLE "financial_journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_id" uuid NOT NULL REFERENCES "financial_journals"("id") ON DELETE RESTRICT,
  "line_number" integer NOT NULL,
  "account_code" varchar(30) NOT NULL REFERENCES "financial_accounts"("code") ON DELETE RESTRICT,
  "debit_minor" bigint NOT NULL DEFAULT 0,
  "credit_minor" bigint NOT NULL DEFAULT 0,
  "location_id" uuid,
  "product_id" uuid,
  "vendor_id" uuid,
  "memo" varchar(500),
  CONSTRAINT "financial_journal_lines_number_unique" UNIQUE ("journal_id", "line_number"),
  CONSTRAINT "financial_journal_lines_positive_check" CHECK ("debit_minor" >= 0 AND "credit_minor" >= 0),
  CONSTRAINT "financial_journal_lines_one_side_check" CHECK (("debit_minor" > 0 AND "credit_minor" = 0) OR ("credit_minor" > 0 AND "debit_minor" = 0))
);
CREATE INDEX "financial_journal_lines_account_idx" ON "financial_journal_lines" ("account_code", "journal_id");
CREATE TABLE "financial_processed_events" (
  "event_id" uuid PRIMARY KEY,
  "event_type" varchar(100) NOT NULL,
  "source_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "payload" jsonb NOT NULL,
  "journal_id" uuid REFERENCES "financial_journals"("id") ON DELETE RESTRICT,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" varchar(1000),
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  CONSTRAINT "financial_processed_events_status_check" CHECK ("status" IN ('PENDING','POSTED','EXCEPTION')),
  CONSTRAINT "financial_processed_events_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "financial_processed_events_status_received_idx" ON "financial_processed_events" ("status", "received_at");
CREATE TABLE "financial_posting_mappings" (
  "mapping_key" varchar(60) PRIMARY KEY,
  "account_code" varchar(30) NOT NULL REFERENCES "financial_accounts"("code") ON DELETE RESTRICT,
  "updated_by" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "financial_supplier_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "invoice_number" varchar(100) NOT NULL,
  "invoice_date" date NOT NULL,
  "due_date" date,
  "currency" varchar(3) NOT NULL,
  "tax_minor" bigint NOT NULL DEFAULT 0,
  "total_minor" bigint NOT NULL,
  "attachment_reference" varchar(500),
  "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
  "exception_reason" varchar(1000),
  "idempotency_key" uuid NOT NULL UNIQUE,
  "request_hash" varchar(64) NOT NULL,
  "created_by" uuid NOT NULL,
  "approved_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "approved_at" timestamptz,
  "journal_id" uuid REFERENCES "financial_journals"("id") ON DELETE RESTRICT,
  CONSTRAINT "financial_supplier_invoices_vendor_number_unique" UNIQUE ("vendor_id", "invoice_number"),
  CONSTRAINT "financial_supplier_invoices_amounts_check" CHECK ("tax_minor" >= 0 AND "total_minor" >= "tax_minor"),
  CONSTRAINT "financial_supplier_invoices_status_check" CHECK ("status" IN ('DRAFT','MATCHED','EXCEPTION','POSTED'))
);
CREATE INDEX "financial_supplier_invoices_status_date_idx" ON "financial_supplier_invoices" ("status", "invoice_date");
CREATE TABLE "financial_supplier_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "financial_supplier_invoices"("id") ON DELETE CASCADE,
  "line_number" integer NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "purchase_order_line_id" uuid NOT NULL,
  "goods_receipt_id" uuid NOT NULL,
  "goods_receipt_line_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price_minor" bigint NOT NULL,
  "tax_minor" bigint NOT NULL DEFAULT 0,
  "line_total_minor" bigint NOT NULL,
  CONSTRAINT "financial_supplier_invoice_lines_number_unique" UNIQUE ("invoice_id", "line_number"),
  CONSTRAINT "financial_supplier_invoice_lines_amount_check" CHECK ("quantity" > 0 AND "unit_price_minor" >= 0 AND "tax_minor" >= 0 AND "line_total_minor" >= "tax_minor")
);
CREATE TABLE "financial_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" varchar(100) NOT NULL,
  "actor_id" uuid,
  "record_type" varchar(50) NOT NULL,
  "record_id" uuid,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "financial_audit_logs_created_idx" ON "financial_audit_logs" ("created_at");
INSERT INTO "financial_accounts" ("code","name","account_type","normal_balance","currency") VALUES
 ('1000','Cash on hand clearing','ASSET','DEBIT','KES'),
 ('1010','Card tender clearing','ASSET','DEBIT','KES'),
 ('1020','Gift card tender clearing','ASSET','DEBIT','KES'),
 ('1200','Inventory asset','ASSET','DEBIT','KES'),
 ('1300','Recoverable input tax','ASSET','DEBIT','KES'),
 ('2000','Goods received not invoiced','LIABILITY','CREDIT','KES'),
 ('2010','Accounts payable','LIABILITY','CREDIT','KES'),
 ('2100','Sales tax payable','LIABILITY','CREDIT','KES'),
 ('3000','Opening equity','EQUITY','CREDIT','KES'),
 ('4000','Retail sales revenue','REVENUE','CREDIT','KES'),
 ('4010','Sales returns and allowances','REVENUE','DEBIT','KES'),
 ('5000','Cost of goods sold','EXPENSE','DEBIT','KES'),
 ('5100','Inventory shrinkage and variance','EXPENSE','DEBIT','KES');
INSERT INTO "financial_posting_mappings" ("mapping_key","account_code") VALUES
 ('TENDER_CASH','1000'), ('TENDER_CARD','1010'), ('TENDER_GIFT_CARD','1020'),
 ('INVENTORY_ASSET','1200'), ('INPUT_TAX','1300'), ('GRNI','2000'), ('ACCOUNTS_PAYABLE','2010'),
 ('SALES_TAX_PAYABLE','2100'), ('OPENING_EQUITY','3000'), ('SALES_REVENUE','4000'),
 ('SALES_RETURNS','4010'), ('COGS','5000'), ('INVENTORY_VARIANCE','5100');

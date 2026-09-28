CREATE TABLE "purchase_order_receipt_requests" (
	"receiving_receipt_id" uuid PRIMARY KEY NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

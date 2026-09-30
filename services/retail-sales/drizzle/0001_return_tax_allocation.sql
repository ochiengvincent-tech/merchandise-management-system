ALTER TABLE "retail_return_lines" ADD COLUMN "tax_refund_minor" integer;
--> statement-breakpoint
ALTER TABLE "retail_return_lines" ADD CONSTRAINT "retail_return_lines_tax_refund_check" CHECK ("tax_refund_minor" IS NULL OR ("tax_refund_minor" >= 0 AND "tax_refund_minor" <= "refund_minor"));

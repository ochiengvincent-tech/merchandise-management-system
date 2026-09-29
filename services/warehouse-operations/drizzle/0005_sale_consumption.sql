ALTER TABLE "warehouse_movements" ALTER COLUMN "destination_bin_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "warehouse_movements" DROP CONSTRAINT "warehouse_movements_type_check";
--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_type_check" CHECK ("movement_type" IN ('OPENING_BALANCE', 'RECEIPT_INTAKE', 'PUTAWAY', 'BIN_TRANSFER', 'QUARANTINE_TRANSFER', 'INVENTORY_ADJUSTMENT', 'SALE_CONSUMPTION'));
--> statement-breakpoint
ALTER TABLE "warehouse_movements" DROP CONSTRAINT "warehouse_movements_type_check";
--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_type_check" CHECK ("movement_type" IN ('OPENING_BALANCE', 'RECEIPT_INTAKE', 'PUTAWAY', 'BIN_TRANSFER', 'QUARANTINE_TRANSFER', 'INVENTORY_ADJUSTMENT', 'SALE_CONSUMPTION', 'RETURN_INTAKE'));

ALTER TABLE "inventory_adjustments"
  ADD COLUMN "idempotency_key" uuid,
  ADD COLUMN "warehouse_command_id" uuid,
  ADD COLUMN "source_bin_id" uuid;

CREATE UNIQUE INDEX "inventory_adjustments_idempotency_key_unique"
  ON "inventory_adjustments" ("idempotency_key");
CREATE UNIQUE INDEX "inventory_adjustments_warehouse_command_unique"
  ON "inventory_adjustments" ("warehouse_command_id");

CREATE TABLE "inventory_sale_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" uuid NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "location_id" uuid NOT NULL REFERENCES "inventory_locations"("id"),
  "original_quantity" integer NOT NULL,
  "original_cost_minor" bigint NOT NULL,
  "returned_quantity" integer NOT NULL DEFAULT 0,
  CONSTRAINT "inventory_sale_costs_sale_product_location_unique" UNIQUE("sale_id", "product_id", "location_id"),
  CONSTRAINT "inventory_sale_costs_quantity_check" CHECK ("original_quantity" > 0 AND "returned_quantity" >= 0 AND "returned_quantity" <= "original_quantity"),
  CONSTRAINT "inventory_sale_costs_value_check" CHECK ("original_cost_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX "inventory_sale_costs_sale_idx" ON "inventory_sale_costs" USING btree ("sale_id");

--> statement-breakpoint
WITH opening_events AS (
  SELECT gen_random_uuid() AS event_id, stock.id, stock.product_id, stock.location_id,
         stock.quantity_on_hand, round(stock.quantity_on_hand * stock.unit_cost * 100)::bigint AS carrying_value_minor
  FROM inventory_stock AS stock
  WHERE stock.quantity_on_hand > 0
)
INSERT INTO inventory_outbox_events (
  event_id, event_type, aggregate_type, aggregate_id, payload, status, attempts, occurred_at
)
SELECT event_id, 'InventoryValuationChanged', 'InventoryStock', id,
       jsonb_build_object(
         'schemaVersion', 1,
         'sourceType', 'OPENING_BALANCE',
         'sourceId', id,
         'sourceEventId', event_id,
         'productId', product_id,
         'locationId', location_id,
         'currency', 'KES',
         'quantityDelta', quantity_on_hand,
         'carryingValueDeltaMinor', carrying_value_minor::text,
         'costPolicyVersion', 'moving-weighted-average-v1',
         'reason', 'OPENING_BALANCE'
       ),
       'PENDING', 0, now()
FROM opening_events;

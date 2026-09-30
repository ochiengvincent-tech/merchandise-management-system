ALTER TABLE "inventory_stock"
  ALTER COLUMN "unit_cost" TYPE numeric(18, 6) USING "unit_cost"::numeric(18, 6);
--> statement-breakpoint
ALTER TABLE "inventory_stock"
  ADD COLUMN "carrying_value_minor" numeric(20, 0) NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TEMP TABLE "_inventory_carrying_reconciliation" ON COMMIT DROP AS
WITH receipt_actual AS (
  SELECT
    details->>'eventId' AS source_event_id,
    product_id,
    location_id,
    sum(round((details->>'receivedUnitPrice')::numeric * 100) * (details->>'quantityReceived')::numeric) AS actual_minor
  FROM inventory_audit_logs
  WHERE action = 'STOCK_RECEIVED'
    AND details ? 'eventId'
    AND details ? 'receivedUnitPrice'
    AND details ? 'quantityReceived'
  GROUP BY details->>'eventId', product_id, location_id
), receipt_recorded AS (
  SELECT
    aggregate_id AS stock_id,
    payload->>'sourceEventId' AS source_event_id,
    (payload->>'productId')::uuid AS product_id,
    (payload->>'locationId')::uuid AS location_id,
    sum((payload->>'carryingValueDeltaMinor')::numeric) AS recorded_minor
  FROM inventory_outbox_events
  WHERE event_type = 'InventoryValuationChanged'
    AND payload->>'reason' = 'RECEIPT'
  GROUP BY aggregate_id, payload->>'sourceEventId', (payload->>'productId')::uuid, (payload->>'locationId')::uuid
), correction_by_stock AS (
  SELECT
    recorded.stock_id,
    sum(coalesce(actual.actual_minor, recorded.recorded_minor) - recorded.recorded_minor) AS correction_minor
  FROM receipt_recorded AS recorded
  LEFT JOIN receipt_actual AS actual
    ON actual.source_event_id = recorded.source_event_id
   AND actual.product_id = recorded.product_id
   AND actual.location_id = recorded.location_id
  GROUP BY recorded.stock_id
), all_values AS (
  SELECT aggregate_id AS stock_id, sum((payload->>'carryingValueDeltaMinor')::numeric) AS recorded_total_minor
  FROM inventory_outbox_events
  WHERE event_type = 'InventoryValuationChanged'
  GROUP BY aggregate_id
)
SELECT stock.id AS stock_id,
       coalesce(all_values.recorded_total_minor, 0) + coalesce(correction_by_stock.correction_minor, 0) AS corrected_minor,
       coalesce(correction_by_stock.correction_minor, 0) AS correction_minor
FROM inventory_stock AS stock
LEFT JOIN all_values ON all_values.stock_id = stock.id
LEFT JOIN correction_by_stock ON correction_by_stock.stock_id = stock.id;
--> statement-breakpoint
UPDATE inventory_stock AS stock
SET carrying_value_minor = reconciliation.corrected_minor,
    unit_cost = CASE WHEN stock.quantity_on_hand > 0
      THEN (reconciliation.corrected_minor / 100 / stock.quantity_on_hand)::numeric(18, 6)
      ELSE 0 END,
    updated_at = now()
FROM _inventory_carrying_reconciliation AS reconciliation
WHERE reconciliation.stock_id = stock.id;
--> statement-breakpoint
ALTER TABLE "inventory_stock"
  ADD CONSTRAINT "inventory_stock_carrying_value_check" CHECK ("carrying_value_minor" >= 0);
--> statement-breakpoint
INSERT INTO inventory_outbox_events (event_id, event_type, aggregate_type, aggregate_id, payload, status, attempts, occurred_at)
SELECT gen_random_uuid(), 'InventoryValuationChanged', 'InventoryStock', reconciliation.stock_id,
       jsonb_build_object(
         'schemaVersion', 1,
         'sourceType', 'ADJUSTMENT',
         'sourceId', reconciliation.stock_id,
         'sourceEventId', gen_random_uuid(),
         'productId', stock.product_id,
         'locationId', stock.location_id,
         'currency', 'KES',
         'quantityDelta', 0,
         'carryingValueDeltaMinor', reconciliation.correction_minor::text,
         'costPolicyVersion', 'moving-weighted-average-v1',
         'reason', 'RECEIPT_COST_RECONCILIATION'
       ),
       'PENDING', 0, now()
FROM _inventory_carrying_reconciliation AS reconciliation
JOIN inventory_stock AS stock ON stock.id = reconciliation.stock_id
WHERE reconciliation.correction_minor <> 0;

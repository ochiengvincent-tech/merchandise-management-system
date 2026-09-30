# Phase 2 Warehouse Operations Service Design

## Purpose

Warehouse Operations tracks where accepted goods are physically stored inside an Inventory location. It creates putaway work from Receiving events, maintains bin-level quantities, records internal bin movements, and keeps damaged goods in a separate quarantine workflow.

Each service owns its database. Services use HTTP for synchronous reads or commands and versioned RabbitMQ events for business facts. Warehouse Operations does not replace Inventory as the owner of product/location stock totals.

## Ownership and invariants

| Data or decision | Owner | Warehouse interaction |
| --- | --- | --- |
| Product, SKU, and active state | Inventory | Resolve IDs and display snapshots through Inventory APIs |
| Warehouse/store location identity and active state | Inventory | Store location ID as a cross-service reference; validate through Inventory API |
| Product/location on-hand, allocated, on-order, unit cost, valuation | Inventory | Never write Inventory tables or update aggregate balances directly |
| Physical receipt observations, accepted/damaged counts, supplier note, GRN | Receiving | Consume GoodsReceived; do not edit or recreate GRNs |
| Bin/rack/zone layout, bin-level placement, internal movements, putaway tasks | Warehouse Operations | Own and audit in warehouse_db |
| PO, vendor and supplier terms | Procurement / Vendor Management | No direct database access |

Core rules:

1. Inventory remains authoritative for total on-hand quantity per product and Inventory location.
2. Warehouse Operations is authoritative for bin assignment of sellable units and its movement history.
3. For each product/location, Warehouse sellable-bin balances should eventually reconcile with Inventory on-hand. Existing stock without bin history is imported into a special UNASSIGNED bin during bootstrap.
4. A bin-to-bin move inside one Inventory location changes Warehouse bin balances only. It does not change Inventory on-hand, allocated, on-order, or valuation.
5. Only quantityAccepted from a GRN enters sellable Warehouse balances. Damaged units enter quarantine; excess and unexpected units remain discrepancy quantities and never become sellable automatically.
6. Inventory remains the only service that commits changes to product/location on-hand. For a Warehouse-managed location, stock adjustments must be initiated through Warehouse Operations with a specific source bin, then submitted to Inventory through an idempotent Inventory-owned adjustment command. Direct Inventory adjustments for managed locations are rejected so bin balances cannot silently drift. Inventory commits the aggregate change, audit, and outbox event atomically; Warehouse applies the matching bin delta only from that event. A timeout is retried with the same command key.
7. Posted movements are immutable. Corrections are new, linked movements with actor, reason, timestamp, and audit record.

## Phase 2 MVP scope

### Included

- Zones and bins associated with an existing Inventory location.
- Bin types: RECEIVING, STORAGE, PICK_FACE, QUARANTINE, DISCREPANCY, and system-managed UNASSIGNED.
- Putaway tasks created from accepted Goods Received Notes.
- Partial and complete putaway, with quantities assigned to target bins.
- Internal bin-to-bin transfers within the same Inventory location.
- Bin-level sellable and quarantine stock lookup.
- Movement history, persisted audits, idempotent commands, retry/DLQ event consumption, and reconciliation reporting.
- Bootstrap that places existing Inventory on-hand into UNASSIGNED before bin-managed operations are enabled.

### Deferred

- Cross-location transfers. These change Inventory totals at two locations and require an Inventory-owned atomic transfer command and a Warehouse dispatch/receipt lifecycle.
- Picking, packing, shipping, sales reservations, and fulfillment.
- Cycle-count approval workflows, write-offs, and damage disposition. The first Warehouse slice may provide the adjustment command path, but count approval and damaged-stock disposition wait for explicit policy and authentication roles. Inventory remains the authority for stock corrections; damaged GRN quantities are not Inventory on-hand.
- Cycle count approvals and automatic variance adjustment. A later design can add count sessions that submit an authorized Inventory adjustment.
- Supplier returns, replacement orders, and invoice/credit workflows.
- Authentication and role assignments. Until platform authentication exists, actor IDs follow the current MMS convention.

## Receiving handoff and putaway flow

Receiving publishes GoodsReceived after its GRN transaction commits. Warehouse Operations consumes the event from mms.events, stores it idempotently, and creates putaway work without delaying the GRN response.

~~~mermaid
sequenceDiagram
    actor Receiver
    actor WarehouseOperator
    participant R as Receiving
    participant Q as RabbitMQ / mms.events
    participant W as Warehouse Operations / warehouse_db
    participant I as Inventory

    Receiver->>R: Record delivery and finalize GRN
    R->>R: Commit GRN, audit, and outbox event
    R-->>Receiver: GRN recorded
    R->>Q: Publish GoodsReceived
    Q-->>W: Deliver receipt facts
    W->>W: Deduplicate event; record receipt projection
    W->>W: Create putaway task for accepted goods
    WarehouseOperator->>W: Open task and choose destination bins
    W->>W: Commit movement, balances, and audit atomically
    W-->>WarehouseOperator: Putaway confirmed
    Note over I,W: Inventory already applied accepted quantity from GoodsReceived; internal putaway does not change aggregate stock.
~~~

The current Receiving event contains purchaseOrderId, goodsReceiptId, grnNumber, destinationLocationId, and line facts including productId, quantityObserved, quantityDamaged, and quantityAccepted. Warehouse uses the event occurrence time as receipt time and never queries Receiving's database.

On event processing:

- Create one receipt projection per goodsReceiptId; duplicate delivery must not duplicate quantities or tasks.
- Add accepted units to a system RECEIVING bin balance as sellable stock awaiting placement.
- Record damaged units in QUARANTINE. These do not count toward Inventory on-hand reconciliation.
- Record observed units not accepted and not damaged in DISCREPANCY. This includes excess; it remains non-sellable pending authorized disposition.
- Create putaway work for accepted units only.
- If a receipt has no accepted lines, it can still create discrepancy/quarantine records but no sellable putaway task.
- Preserve GRN and line IDs as external references, without cross-service foreign keys.

Event processing uses a durable queue bound to GoodsReceived, event-ID idempotency, retry queues, a dead-letter queue, and reconnect behavior consistent with existing MMS consumers. Warehouse commits projected receipt data, bin balance updates, task creation, and audit in one transaction before acknowledging the event.

## Putaway and internal movement rules

- A task line can be put away in multiple movements. Each quantity must be a positive integer no greater than the task line's remaining accepted quantity.
- The source is the receipt's RECEIVING bin. The destination must be an active STORAGE or PICK_FACE bin in the same Inventory location.
- A movement cannot make a source balance negative.
- QUARANTINE or DISCREPANCY stock cannot move into a sellable bin through ordinary putaway.
- Moving quarantine goods to another quarantine bin is allowed and audited. Release, destruction, supplier return, or conversion to sellable goods requires a separate disposition workflow.
- Internal transfers require source and destination bins to belong to the same Inventory location and have compatible bin types and the same product/disposition.
- Movement, source/destination balance changes, task progress, audit row, and idempotency result commit in one database transaction.
- Replaying a movement request with the same key and body returns the original result; reusing the key with different data returns 409.
- Completed movements cannot be edited or deleted.

## Bootstrap and reconciliation

Inventory already contains product/location balances, so Warehouse must not start with an empty bin ledger and claim it represents all stock.

Before enabling bin-level operations for a location:

1. Read Inventory stock through its paginated API; never query the Inventory database.
2. Create a system UNASSIGNED bin for the location.
3. Import each product's current on-hand into that bin as an OPENING_BALANCE movement with source INVENTORY_BOOTSTRAP, timestamp, and Inventory stock reference.
4. Store the bootstrap completion time and source watermark. Ignore or reconcile pre-watermark events so snapshot data is not applied twice.
5. Compare Warehouse sellable totals with Inventory on-hand and report any variance.
6. Enable warehouse operations for that location only after the baseline is complete.

Reconciliation is read-only. It reports product/location totals, Warehouse sellable-bin totals, variance, and calculation time; it never silently alters quantities. Before enabling Warehouse management for a location, Inventory must persist that location's managed status. Inventory's existing adjustment endpoint rejects direct adjustments for managed locations. Users instead submit an adjustment through Warehouse with a source bin, reason, and idempotency key. Warehouse validates its bin balance and sends an Inventory-owned idempotent command. Inventory commits its stock update, adjustment record, audit, and InventoryStockAdjusted outbox event in one transaction. The event includes the Warehouse command reference and source bin. Warehouse applies the bin change idempotently from that event and reports PENDING until synchronized. Retrying after a timeout uses the same key; it cannot create a second Inventory adjustment. This keeps Inventory authoritative without allowing a successful aggregate-only adjustment to leave bin balances inconsistent.

### Adjustment command and managed-location cutover

This is the selected policy for stock adjustments; do not leave it as a deployment-time choice:

1. Inventory stores whether each location is Warehouse-managed. Warehouse sets this through an Inventory API only after the opening-balance import and reconciliation succeed. Disabling management requires a new reconciliation and an explicit cutover; it is not a simple toggle.
2. For unmanaged locations, the existing Inventory adjustment workflow remains unchanged.
3. For managed locations, Inventory rejects the existing direct adjustment route with a clear 409 directing the caller to Warehouse Operations. The web app shows the Warehouse adjustment experience for those locations.
4. A Warehouse adjustment names a source bin, product, signed quantity change, reason, actor, and idempotency key. Warehouse checks the bin and, for a decrease, reserves the quantity so another movement cannot spend it while the Inventory command is pending.
5. Warehouse persists a PENDING command before calling Inventory. It submits the same idempotency key and a stable Warehouse command ID to an Inventory-owned command endpoint. Inventory commits its aggregate quantity, adjustment record, audit, idempotency result, and InventoryStockAdjusted outbox event atomically.
6. The event carries the Inventory adjustment ID, Warehouse command ID, product/location, source bin, signed delta, and actor. Warehouse applies the change once, creates its movement/audit records, releases the reservation, and marks the command SYNCED. The browser can show PENDING while the event is in flight.
7. If the request or event is delayed, retry with the same key. Inventory returns the original adjustment result and emits no duplicate effect. A different body with an already used key returns 409.

The Inventory event is the confirmation that changes Warehouse bin balances; Warehouse must not update the bin optimistically and then apply the event a second time. The bin reference lets Warehouse preserve the physical location of both increases and decreases. The Inventory side stores the Warehouse command ID and source bin only as references, not as Warehouse-owned data or foreign keys.

Inventory API additions required for this policy:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /locations/:locationId/warehouse-management/enable | Mark a reconciled location as Warehouse-managed and return its management state |
| POST | /locations/:locationId/warehouse-management/disable | Begin an explicit, reconciled cutover back to unmanaged stock operations |
| POST | /stock/adjustments/from-warehouse | Idempotently commit a bin-scoped adjustment submitted by Warehouse |

Add an Inventory adjustment-request/idempotency record (or equivalent unique idempotency key on the adjustment record) so a lost HTTP response cannot create a duplicate stock change. Inventory publishes InventoryStockAdjusted for Warehouse-originated adjustments. GoodsReceived remains the only stock-increase event for received PO goods, preventing duplicate receipt application.

## Data model

Warehouse Operations owns a private warehouse_db.

### warehouse_bins

- id UUID primary key.
- location_id: Inventory location ID, cross-service reference only.
- code, name, bin_type, status (ACTIVE / INACTIVE).
- Optional zone, aisle, rack, shelf, and capacity metadata.
- Unique bin code within a location.
- System-managed bins cannot be deactivated while they have balances or open tasks.

### warehouse_bin_balances

- id, bin_id, product_id (Inventory product ID, no cross-service FK).
- disposition: SELLABLE, QUARANTINED, or DISCREPANCY.
- quantity non-negative integer and timestamps.
- Unique key on bin_id + product_id + disposition.
- Only SELLABLE balances contribute to the comparison against Inventory on-hand. Other dispositions remain separately visible and are never added to Inventory.

### warehouse_receipts and warehouse_receipt_lines

- goods_receipt_id UUID primary key from Receiving; deduplicates event replay.
- GRN number, PO ID, location ID, receipt time, source event ID, and processing time.
- Receipt lines copy GRN line ID, product ID, observed, damaged, accepted, and discrepancy quantities.
- A unique receipt-line reference prevents a replay from applying one GRN line twice.
- Receiving remains the immutable GRN owner.

### warehouse_putaway_tasks and warehouse_putaway_task_lines

- Task ID, GRN ID, status (OPEN, IN_PROGRESS, COMPLETED), and timestamps.
- Task lines reference the GRN line and product; record accepted, completed, and remaining quantities.
- Unique task per GRN. No task is needed if there are no accepted quantities.

### warehouse_movements

- Immutable movement ID and idempotency key.
- Product, quantity, source bin, destination bin, disposition, reference type/ID, actor, reason, and timestamp.
- Movement types: OPENING_BALANCE, PUTAWAY, BIN_TRANSFER, and QUARANTINE_TRANSFER.
- Putaway movements reference task line; receipt-originated balances reference GRN and line IDs.

### warehouse_audit_logs

Important actions include BIN_CREATED, BIN_UPDATED, PUTAWAY_TASK_CREATED, PUTAWAY_COMPLETED, BIN_TRANSFERRED, QUARANTINE_TRANSFERRED, BOOTSTRAP_COMPLETED, and RECONCILIATION_VARIANCE_FOUND. Audit actor, record IDs, relevant before/after quantities, reason, and time. Never store secrets or stack traces in audit details.

### warehouse_adjustment_commands

- Idempotency key, request hash, location/product/source-bin IDs, signed delta, reason, actor, status (PENDING, SYNCED, FAILED), stable Warehouse command ID, and Inventory adjustment ID.
- For a pending decrease, reserve the requested quantity so it cannot be moved or adjusted twice.
- The request is saved before calling Inventory. A retry with the same key resumes or returns the original operation; it never creates a second adjustment.
- Warehouse bin balances change only when the matching InventoryStockAdjusted event is processed. Failed/pending commands remain visible for safe retry and operational review.

### warehouse_processed_events, warehouse_outbox_events, and warehouse_idempotency_records

- Processed-event IDs are stored in the same transaction as event effects.
- Outbox rows are written atomically with Warehouse-owned business facts before publishing.
- Idempotency records store a request hash and original result for mutating HTTP requests.

## HTTP API (initial)

Base path: /api/v1. Errors use the MMS standard contract:

~~~json
{
  "error": {
    "message": "Validation failed",
    "details": [{ "field": "destinationBinId", "message": "Choose an active storage bin in this location." }]
  }
}
~~~

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /locations/:locationId/bins | List/search bins for an Inventory location |
| POST | /locations/:locationId/bins | Create a bin |
| GET | /bins/:id | Read a bin and its current balances |
| PATCH | /bins/:id | Update bin metadata/status |
| GET | /putaway-tasks | Queue/filter by status, GRN, location, and product |
| GET | /putaway-tasks/:id | Task detail with accepted, placed, and remaining quantities |
| POST | /putaway-tasks/:id/complete | Record partial/final target-bin placements; requires Idempotency-Key and x-actor-id until authentication exists |
| POST | /locations/:locationId/adjustments | Submit a bin-scoped adjustment through Inventory; requires Idempotency-Key and x-actor-id |
| GET | /adjustments/:id | Read adjustment synchronization status and Inventory reference |
| POST | /movements | Record an idempotent internal bin-to-bin transfer |
| GET | /stock | Search bin-level balances by location, product, bin, and disposition |
| GET | /movements | Paginated immutable movement history |
| GET | /reconciliation | Compare Inventory on-hand to Warehouse sellable bin totals |
| GET | /audit-logs | Paginated Warehouse Operations audit history |

All list APIs are paginated. Bin and product identities are validated through service APIs when a command is created; external IDs are not foreign keys.

## Event contracts

### Consumes

- GoodsReceived v1 from Receiving. Warehouse uses accepted/damaged/observed counts to create staged sellable, quarantine, and discrepancy quantities.
- InventoryStockAdjusted v1 for adjustments submitted through the Warehouse workflow. The event carries the Inventory adjustment ID, product/location, signed quantity change, Warehouse command reference, source bin ID, actor, and occurrence time. Inventory must reject its legacy direct adjustment command for a location marked Warehouse-managed. Inventory stock changes from GoodsReceived continue to be projected from GoodsReceived only; do not emit a second adjustment event for receipt stock.

### Publishes

- WarehousePutawayCompleted v1: GRN ID, task ID, location ID, product lines, quantities, source/destination bin IDs, actor, and timestamp.
- WarehouseBinTransferred v1: location ID, product, quantity, source/destination bins, disposition, actor, and timestamp.

Warehouse movement events are operational facts for audit, reporting, and future fulfillment services. Inventory must not consume them as stock additions or subtractions for within-location movements.

All messages use the durable mms.events topic exchange and standard envelope fields eventId, eventType, aggregateType, aggregateId, payload, and occurredAt. Consumers validate versions, deduplicate event IDs, commit effects before acknowledging, and use bounded retries plus a dead-letter queue.

## Feature flag and UI

Use the existing FEATURE_WAREHOUSE_OPERATIONS_ENABLED server flag and VITE_FEATURE_WAREHOUSE_OPERATIONS_ENABLED web flag, defaulting to false. When disabled, hide Warehouse Operations navigation and show the shared styled Coming Soon page on direct route access. Register backend business routes only when enabled.

Initial screens:

1. Warehouse overview: select location; show active bins, open putaway tasks, sellable/quarantine/discrepancy totals, and reconciliation status.
2. Putaway queue: sort by GRN age, destination location, and discrepancy state.
3. Putaway detail: show supplier, PO, GRN, product, accepted quantity, already placed, remaining, and target-bin selection; support partial placement.
4. Bin stock: search product/SKU or scan code, then show each bin and disposition.
5. Movement history: filter by location, product, bin, movement type, actor, and date.

Keep titles and statuses visible in light and dark themes. Forms must show per-field errors, pending/success feedback, and explain when goods are quarantined or need a separate disposition.

## Acceptance criteria

- Receiving remains usable if Warehouse Operations is unavailable; event processing retries independently.
- Each GoodsReceived event creates at most one Warehouse receipt projection and one set of putaway tasks.
- Accepted goods enter a receiving bin once; damage and overage never become sellable automatically.
- Partial putaway updates source/destination balances and task progress atomically.
- Internal bin transfers preserve total sellable quantity for that product and Inventory location.
- A movement cannot cross Inventory locations, use an inactive bin, overdraw a source, or convert quarantine/discrepancy stock to sellable stock.
- Opening stock can be bootstrapped idempotently into UNASSIGNED; reconciliation uses APIs and never direct database access.
- Reconciliation never silently changes stock.
- Every posted command has an actor, audit entry, and idempotency behavior; event effects and processed-event IDs are atomic.
- The service has its own database, migrations, health checks, feature flag, OpenAPI contract, and configuration.
- Warehouse outages do not block Receiving GRN completion or Inventory's GoodsReceived processing.

## Suggested implementation order

1. Keep the first release to one-location bins, receipt putaway, and bin transfers; defer cross-location transfers and cycle-count approval.
2. Add the Inventory Warehouse-managed location marker and idempotent Inventory adjustment command/event contract; reject direct adjustments for managed locations.
3. Add Warehouse OpenAPI/event schemas and the standalone warehouse-operations service with its own database, migrations, middleware, health route, and feature flag.
4. Implement event idempotency and consume GoodsReceived to create receipt projections and putaway tasks.
5. Implement bins, balances, putaway, bin transfers, and the pending/synced Inventory adjustment workflow as transactional, audited, idempotent operations.
6. Add Inventory snapshot bootstrap and read-only reconciliation; establish a safe event watermark before enabling each location.
7. Implement the feature-flagged UI and verify Receiving, Inventory, audit, and Warehouse flows together.

## Decisions to finalize before implementation

- Quarantine disposition: define who may release, return, or write off damaged goods and which Inventory command/event records a write-off. Until then, keep quarantine quantities separate and non-sellable.
- Bin capacity: decide whether capacity is descriptive in the first release or enforced for units/volume/weight. The MVP can store optional capacity metadata but should not claim enforcement before product dimensions exist.
- Cross-location transfers: design as a separate workflow with Inventory-authoritative paired stock changes, shipment in transit, destination receipt, cancellation, and idempotent recovery.
- Count approval: define whether a count requires supervisor review before Inventory updates; defer until authentication/roles and the Inventory adjustment contract are ready.

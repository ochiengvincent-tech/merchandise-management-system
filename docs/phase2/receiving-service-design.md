# Phase 2 Receiving Service Design

## Purpose

Receiving records what physically arrived at a warehouse, compares it with an open purchase order, documents shortages, overages, and damage, and issues an immutable Goods Received Note (GRN).

This design follows the Phase 1 service boundaries and the Phase 2 assignment. Each service owns its database. Services communicate through versioned HTTP contracts for questions or commands that need an immediate answer, and RabbitMQ events for business facts that downstream services can process independently.

## Scope

### Included

- Find open purchase orders and their remaining quantities.
- Record deliveries against sent or partially received POs.
- Capture delivery note details, scanned product codes, physical quantities, accepted quantities, damage, and notes.
- Identify shortages, overages, damaged items, and unexpected products.
- Produce and retrieve GRNs.
- Publish accepted receipt quantities as `GoodsReceived` events.
- Keep Procurement's received quantities and PO status synchronized.
- Maintain Receiving audit records and retry failed cross-service work safely.

### Excluded

- Supplier invoice matching, credit notes, supplier disputes, or supplier payments.
- Changing approved PO quantities, prices, or destinations.
- Creating stock adjustments or directly editing Inventory data.
- Bin/rack putaway and warehouse transfers. These belong to Warehouse Operations.
- Making damaged or unaccepted quantities available for sale.
- Authentication/role implementation; caller actor IDs follow the existing Phase 1 convention until the platform authentication work is delivered.

## Ownership boundaries

| Data or decision | Owner | Receiving interaction |
| --- | --- | --- |
| PO supplier, destination, status, ordered and previously accepted quantities | Procurement | Read current PO via API; report accepted quantities via an idempotent command |
| Product SKU, barcode, active state | Inventory | Validate scanned code through Inventory API |
| Physical delivery, observed/accepted/rejected quantities, condition, delivery note, GRN | Receiving | Persist only in Receiving's database |
| On-hand, on-order, allocated, valuation, product/location stock | Inventory | Consume `GoodsReceived`; no direct Receiving DB or stock writes |
| Putaway and bin locations | Warehouse Operations (later Phase 2 service) | Consume receipt facts when that service exists |
| Supplier identity and current supplier terms | Vendor Management | No Receiving ownership or direct database access |

Procurement remains authoritative for the PO's received totals. Receiving is authoritative for what the receiver observed and recorded physically. An accepted quantity sent to Procurement is a summary of a GRN line, not a second physical receipt record.

## Receiving flow

```mermaid
sequenceDiagram
    actor Receiver
    participant UI as MMS web app
    participant R as Receiving API / receiving_db
    participant P as Procurement API / procurement_db
    participant I as Inventory API / inventory_db
    participant Q as RabbitMQ
    participant W as Warehouse Operations (later)

    Receiver->>UI: Select open PO and enter delivery inspection
    UI->>R: POST /api/v1/receipts + Idempotency-Key
    R->>P: GET PO (current status, remaining lines, destination)
    R->>I: Validate product codes for scanned items
    R->>R: Persist immutable GRN + audit + GoodsReceived outbox
    R->>P: Record accepted quantities with GRN ID (idempotent)
    P->>P: Update received totals/status + procurement audit
    R->>R: Mark PO synchronization complete
    R-->>UI: Return GRN; receipt completion does not wait for consumers
    R->>Q: Publish GoodsReceived from outbox
    Q-->>I: Apply accepted stock and reduce on-order
    Q-->>W: Create future putaway/quarantine work
```

### Request completion and retries

1. Receiving validates the PO synchronously with Procurement and product codes with Inventory before accepting a new GRN. A failed validation is an error; Receiving must not assume either service accepted the request.
2. Receiving writes the GRN, its audit record, and the `GoodsReceived` outbox event in one Receiving database transaction. The caller supplies a UUID `Idempotency-Key`; it is also the stable GRN/event ID.
3. Receiving asks Procurement to add the accepted quantities, passing the same GRN ID. Procurement must atomically update PO lines/status, record its audit event, and store the idempotency result. Replaying the same key and same body returns the original result; using the key with different data returns `409`.
4. A successful Procurement response marks the synchronization state complete. If Procurement is unavailable or the response is lost, Receiving returns a retryable error that says the GRN was recorded and can be retried with the same key. A background worker retries recorded, unsynchronized GRNs. The GRN is not recreated and quantities are not counted twice.
5. RabbitMQ delivery is independent of the HTTP response. The outbox publisher retries until broker confirmation; Inventory deduplicates by event ID. Receiving does not wait for Inventory or Warehouse Operations to finish before reporting the GRN.
6. If a `GoodsReceived` publication is delayed, the physical GRN remains recorded and Procurement synchronization may already be complete. The UI shows the GRN as recorded; operational publication failure is visible through outbox health/metrics and audit/operations tooling, not by asking a warehouse user to resubmit it with a new key.

The GRN is the physical record, so a later correction is a separate, auditable receipt correction/reversal workflow. Editing or deleting a posted GRN is out of scope for the first slice.

## Receipt and discrepancy rules

For each PO line, Receiving obtains the current remaining quantity from Procurement. The client cannot set or override the expected quantity.

- `quantityObserved`: units physically counted for this line.
- `quantityDamaged`: observed units found damaged.
- `quantityAccepted`: good units accepted against the open PO quantity.
- `quantityRejected`: derived as `quantityObserved - quantityAccepted`; this includes damaged units and excess units that are not authorized by the PO.
- `quantityOutstanding`: Procurement's ordered quantity minus its accepted received quantity.

Validation rules:

1. Only POs in `SENT` or `PARTIALLY_RECEIVED` can receive a GRN.
2. Each PO line appears at most once per GRN. All line IDs must belong to the referenced PO.
3. Quantities are non-negative integers; `quantityDamaged <= quantityObserved` and `quantityAccepted <= quantityObserved - quantityDamaged`.
4. `quantityAccepted <= quantityOutstanding`. A supplier overage never increases the authorized PO quantity.
5. A short shipment is recorded when observed quantity is below the open quantity inspected. It does not fabricate a receipt for missing units.
6. Damaged quantity is recorded on the GRN and is excluded from accepted quantity and the inventory update. Damage is flagged for quarantine/disposition; it is not sellable stock.
7. Unexpected product codes may be recorded as unplanned GRN lines only after Inventory validates the product. They are overages, have no PO line ID, and have `quantityAccepted = 0` until a separate authorized PO/change or disposition flow exists.
8. Duplicate PO lines, inactive/unknown products, wrong product codes, invalid PO states, and over-acceptance return field-level errors and do not create a GRN.
9. A GRN can contain accepted and rejected quantities together; each line retains its observed condition and discrepancy flags (`SHORTAGE`, `OVERAGE`, `DAMAGE`).
10. Procurement's `quantityReceived` increases by accepted units only. This means rejected/damaged items do not fulfill the purchase commitment; replacement goods can still be expected. Whether vendor credit/replacement follow-up is required is a business process outside this service.

For example, if 100 units remain on the PO, 95 arrive, 3 are damaged, and 92 are accepted: the GRN records 95 observed, 3 damaged, 92 accepted, and a shortage of 5; Procurement records 92 additional received; Inventory eventually adds 92 on hand and removes 92 from on order.

## Domain model

Receiving owns a private `receiving_db` with these initial tables:

### `goods_receipts`

- `id` UUID primary key; equals the idempotency/event ID.
- `grn_number` human-readable, unique number.
- `purchase_order_id` cross-service ID, not a foreign key.
- `supplier_delivery_note` optional supplier reference.
- `destination_location_id` snapshot from the validated PO, cross-service ID.
- `received_by` actor UUID.
- `received_at`, `created_at` timestamps.
- `notes` optional header note.
- `procurement_sync_status`: `PENDING`, `SYNCED`, or `RETRYING`.
- `procurement_sync_error` safe diagnostic, without internal stack traces.
- `request_hash` for idempotency payload comparison (never returned publicly).

### `goods_receipt_lines`

- `id`, `goods_receipt_id`.
- Nullable `purchase_order_line_id` for unexpected items; no cross-service FK.
- `product_id` and scanned `product_code`/SKU/barcode, with product name snapshot for readability.
- `quantity_expected_at_receipt`, `quantity_observed`, `quantity_damaged`, `quantity_accepted`.
- Derived `quantity_rejected` and discrepancy flags, or stored derived values protected by transaction-level validation.
- `condition`: `GOOD`, `DAMAGED`, or `MIXED` derived from the line counts.
- Line notes.

### `receiving_audit_logs`

Important events include `GRN_RECORDED`, `GRN_PROCUREMENT_SYNCED`, `GRN_SYNC_RETRY_FAILED`, and `GRN_CORRECTED` when a later correction workflow exists. Audit details identify the GRN and meaningful before/after quantities, not secrets or stack traces.

### `outbox_events`

Durable `GoodsReceived` messages, with pending/published/failed status, attempts, timestamps, and event ID. GRN, audit, and outbox insertion are atomic.

## HTTP API (initial)

Base path: `/api/v1`. Errors use the standard MMS contract:

```json
{
  "error": {
    "message": "Validation failed",
    "details": [{ "field": "lines.0.quantityAccepted", "message": "Cannot exceed the remaining PO quantity" }]
  }
}
```

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/purchase-orders/open` | Receiving work queue, sourced from Procurement's eligible sent/partially received POs |
| `GET` | `/purchase-orders/:id` | Current PO and remaining lines for inspection |
| `POST` | `/receipts` | Validate and create GRN; requires `Idempotency-Key` and `x-actor-id` until authentication exists |
| `GET` | `/receipts` | Search/list GRNs; filter by PO, GRN, delivery note, discrepancy, and date |
| `GET` | `/receipts/:id` | Retrieve GRN and synchronization state |
| `GET` | `/audit-logs` | Paginated Receiving audit history, consistent with other services |

The two purchase-order routes are a Receiving-facing read model/proxy over Procurement. They do not make Receiving the PO owner. The implementation should use an efficient Procurement list/filter contract rather than fetching an unbounded PO list.

`POST /receipts` body (illustrative):

```json
{
  "purchaseOrderId": "<uuid>",
  "supplierDeliveryNote": "DN-2048",
  "notes": "Pallet 2 wrap torn; contents inspected",
  "lines": [
    {
      "purchaseOrderLineId": "<uuid>",
      "productId": "<uuid>",
      "productCode": "SKU-1001",
      "quantityObserved": 95,
      "quantityDamaged": 3,
      "notes": "Three cartons crushed"
    }
  ]
}
```

The service obtains expected/outstanding quantities and authoritative product identity from service APIs. The client must not submit `quantityAccepted`; Receiving derives it as the lower of undamaged observed units and the PO line's current outstanding quantity. The response returns a generated GRN number, persisted lines/discrepancies, and a `procurementSyncStatus`; it does not expose the internal request hash.

## Event contract

Receiving publishes `GoodsReceived` only after the GRN transaction commits. The event describes accepted stock, not all physically observed goods:

```json
{
  "eventId": "<grn-uuid>",
  "eventType": "GoodsReceived",
  "aggregateType": "GoodsReceipt",
  "aggregateId": "<grn-uuid>",
  "occurredAt": "<RFC-3339 timestamp>",
  "producer": "receiving",
  "version": 1,
  "data": {
    "goodsReceiptId": "<grn-uuid>",
    "grnNumber": "GRN-...",
    "purchaseOrderId": "<uuid>",
    "destinationLocationId": "<uuid>",
    "lines": [
      {
        "purchaseOrderLineId": "<uuid>",
        "productId": "<uuid>",
        "quantityAccepted": 92,
        "unitPrice": 12.5,
        "currency": "KES"
      }
    ]
  }
}
```

- Inventory deduplicates by `eventId`, adds accepted quantity to on-hand, and reduces on-order by the same quantity. It updates valuation using the PO's locked unit price.
- Warehouse Operations can later consume the event to create putaway work. Damaged/rejected quantities remain on the GRN; the later warehouse quarantine contract may consume discrepancy details or a dedicated `GoodsQuarantined` event.
- The `unitPrice` and currency are copied from the approved PO snapshot via Procurement; Receiving does not calculate or own valuation.
- Consumers commit their state change and processed-event record together before acknowledging the message.

## Phase 1 compatibility and cutover

Procurement currently exposes `POST /purchase-orders/:id/receipts` and emits `PurchaseOrderReceived`, which Inventory consumes to update on-hand and on-order. Leaving this path active alongside `GoodsReceived` would allow the same physical delivery to be counted twice.

Before enabling the Phase 2 Receiving feature:

1. Update Procurement so Receiving can report accepted quantities with the GRN ID as an idempotency key. Procurement remains the owner of PO received totals/status and writes its audit record in the same transaction.
2. For this Receiving-owned command, Procurement must not publish the legacy stock-changing `PurchaseOrderReceived` event. Receiving alone publishes `GoodsReceived` for that GRN. Legacy direct receipt must be disabled/deprecated as part of the same cutover (or explicitly gated off when Receiving owns receipts).
3. Update Inventory to consume `GoodsReceived` idempotently and apply accepted quantity once. Keep the legacy event only during a defined migration window, then remove it after all callers are cut over.
4. Test duplicate HTTP retries, duplicate RabbitMQ delivery, lost Procurement responses, delayed Inventory, and failed outbox publication.
5. Keep the feature flag off until database migrations, Procurement and Inventory contracts, and the Receiving UI are all ready together.

## Feature flag and navigation

The Receiving backend and frontend already have `FEATURE_RECEIVING_ENABLED` / `VITE_FEATURE_RECEIVING_ENABLED`, defaulting to false. When false, the Receiving navigation entry stays hidden and direct route access shows the shared styled Coming Soon page. When true, the real Receiving workspace replaces the placeholder and its API routes are registered. No flag default changes in this design step.

## UI outline

1. **Receiving queue:** open/sent and partially received POs, supplier, destination, expected delivery date, remaining line quantities, and search/filter.
2. **Inspect delivery:** PO context stays visible; scan/search products; input observed, damaged, and accepted quantities; show calculated outstanding quantity and clear discrepancy indicators.
3. **Review and record:** summarize accepted/rejected quantities, shortage/overage/damage warnings, require confirmation for overage and damage, then record the GRN.
4. **GRN detail/print view:** human-readable GRN number, PO/supplier/delivery note, receiver/time, line counts, discrepancies, notes, and Procurement sync status.
5. **Retry visibility:** show a clear pending synchronization state and retry action/status; never invite a new submission with a new idempotency key for an already recorded GRN.

## Acceptance criteria

- A sent/partially received PO can be inspected without direct database access.
- Draft, cancelled, completed, or otherwise ineligible POs cannot receive goods.
- Unknown/wrong/inactive products and PO lines fail with clear field errors.
- Every delivery attempt can be recorded as a GRN with unique number, actor, time, and delivery-note reference.
- Shortage, overage, and damage are visibly and durably recorded.
- Overages, unexpected items, and damaged items cannot silently increase sellable inventory or authorized PO quantities.
- Procurement received totals equal the sum of accepted GRN quantities, and PO status is derived from those totals.
- An idempotent retry cannot create a second GRN, increase PO totals twice, or cause Inventory to add stock twice.
- A GRN and its `GoodsReceived` outbox event are committed atomically.
- Inventory eventually applies accepted quantity to On Hand and removes that quantity from On Order; the receiver is not blocked by Inventory availability.
- Important Receiving actions have persisted audit records.
- Feature flag off hides navigation/API business routes and direct browser access retains the Coming Soon experience.
- Typecheck, service tests, cross-service contract tests, OpenAPI validation, and the existing Phase 1 suites pass.

## Suggested implementation sequence

1. Approve this design and settle any remaining business policy choices below.
2. Publish the `GoodsReceived` v1 schema and add Receiving-specific API/OpenAPI contracts.
3. Add Receiving database/schema/migrations, API foundation, GRN persistence, and audit records behind the existing flag.
4. Add an idempotent Procurement command for accepted quantities; deprecate the legacy direct receipt route for the Phase 2 cutover.
5. Add the Receiving transactional outbox and Inventory `GoodsReceived` consumer with event idempotency.
6. Add cross-service failure/retry tests and update affected Phase 1 tests/contracts.
7. Add Receiving UI: queue, inspection form, GRN view; then enable the feature flag for local demo only.

## Decisions to confirm during implementation planning

These are business-policy details not fully fixed by the assignment and should be made explicit before production rollout:

- Whether a single GRN may cover multiple POs (recommended initial rule: one PO per GRN).
- Whether received-but-damaged units remain physically tracked in an explicit quarantine stock bucket or only as Receiving disposition records until Warehouse Operations exists.
- How accepted overage should ever be authorized (recommended: reject/record as overage; accept only after an approved PO amendment or separate authorization).
- Whether clerks may finalize a GRN with discrepancies or need a supervisor sign-off (the current assignment requires flagging, but does not define approval roles).
- Whether post-finalization corrections use reversal GRNs, linked correction records, or a controlled amendment to a draft only.

Recommended defaults for the first implementation: one PO per GRN, no accepted overages, damage excluded from accepted stock and clearly marked for quarantine disposition, allow receiver to finalize with a warning and persist the actor; defer role-based supervisor approval until authentication/authorization is implemented.

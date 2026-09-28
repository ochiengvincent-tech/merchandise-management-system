# Supplier Reliability Design

## Purpose

Give buyers a transparent, evidence-based view of supplier delivery performance. The Phase 1 assignment explicitly puts supplier reliability history in Vendor Management and describes the central question as whether a supplier delivered on time. The score should explain its evidence and sample size rather than appear as an unexplained vendor attribute.

## Ownership

Vendor Management owns the supplier reliability read model because it owns supplier profiles and the assignment calls for reliability history there. Do not add a mutable `reliabilityScore` column to `vendors`: the score is derived from purchase and receiving facts, changes as new events arrive, and needs its own provenance and formula version.

Use two Vendor Management tables:

- `vendor_reliability_orders`: one projected performance row per vendor and PO, including ordered units, observed units, accepted units, damaged units, units accepted by their expected dates, component scores, due-date inputs, evaluation state, and last update. It is a performance record, not Procurement's PO record.
- `vendor_reliability_summaries`: current rolling score and component rates per vendor, evaluated PO count, period start/end, formula version, and calculation timestamp. This is a cache/read model that can be rebuilt from the order rows and events.

Vendor Management must not query Procurement or Receiving databases directly. It consumes versioned messages from the existing RabbitMQ exchange and stores only its reliability projection. Procurement remains authoritative for PO terms and status; Receiving remains authoritative for physical delivery and inspection facts.

## Inputs and event flow

1. When Procurement sends a PO, publish a `PurchaseOrderSent` fact with vendor ID, PO ID, sent timestamp, and each line's ID, ordered quantity, and a snapshot of the supplier-product lead time. Snapshot the lead time used for scoring so later edits to the supplier catalog do not rewrite history.
2. Receiving publishes `GoodsReceived` with PO ID, receipt ID, occurrence timestamp, and each PO line's observed, damaged, and accepted quantities. The current event has accepted quantities but needs these additional performance fields.
3. Vendor Management consumes both event types idempotently into its own durable queue and projection. Duplicate events must not add quantities twice. A replay or rebuild must reproduce the same scores.
4. Procurement/Receiving event delivery is independent of the user request; their existing outbox/retry behavior remains in place. Vendor Management should have its own retry and dead-letter behavior and must not delay receipt completion.

## Expected delivery date

The current PO stores a buyer-requested delivery date, while Vendor Management already stores an agreed `leadTimeDays` for each supplier-product relationship. For the first score version, calculate each PO line's expected date as `PO sentAt + leadTimeDaysSnapshot`. Use the PO's sent time because the supplier lead time begins when the PO is sent.

This is the best currently available agreement-based measure. If a supplier later acknowledges a different delivery date, a future vendor confirmation workflow can add a supplier-confirmed date and make that the scoring input. Do not silently treat a requested date as a supplier promise.

## Formula (version 1)

Score each PO on a 0–100 scale, then average PO scores equally over the trailing 12 months. Equal PO weighting prevents one unusually large order from dominating the supplier's history.

For each PO:

- **On-time rate (50%):** `100 × accepted units received on or before their line due dates ÷ ordered units`. Each PO line uses its own snapshotted lead time.
- **Quantity fulfillment (30%):** `100 × min(total accepted units, total ordered units) ÷ total ordered units`. Excess units never raise the score.
- **Quality rate (20%):** `100 × max(0, observed units − damaged units) ÷ observed units`. A PO with no observed units has no quality component until a delivery is recorded.
- **PO score:** `0.50 × on-time rate + 0.30 × quantity fulfillment + 0.20 × quality rate`.

Use accepted quantities only for PO fulfillment; damage and excess quantities do not satisfy the authorized order. Use GRN receipt timestamps to determine when accepted units arrived. Partial receipts count toward the on-time numerator only if they arrived by the due date. Late deliveries can improve the final fill rate, but cannot retroactively improve on-time performance.

Include a PO in the rolling score when it is completed or when all of its expected line dates have passed. Recompute its projection as subsequent GRNs arrive. Exclude POs canceled by the buyer before their expected delivery date. The current cancellation model does not reliably identify supplier-caused cancellations; add those as a scored outcome only after cancellation attribution is structured.

Show a numeric headline score only after at least three eligible POs. Below that threshold, show “Not enough delivery history” and the available sample count. Always show the three component rates, eligible PO count, scoring period, and calculation date alongside the score.

## API and UI

Vendor Management should expose reliability history and summary through its vendor API, for example `GET /vendors/:id/reliability` and a summary field in vendor list/detail responses. The history should identify the PO, expected date, completion/progress, on-time rate, fulfillment rate, quality rate, score, and the formula version. It should not expose other services' internal records or database details.

The web UI can then show a score and sample size on the vendor list/detail page, with a history view that explains late, short, and damaged deliveries. Mark the measure as based on agreed lead-time snapshots so buyers know what the score means.

## Rollout order

1. Add event fields/contracts for PO send and GRN performance facts, plus idempotent consumers in Vendor Management.
2. Add Vendor Management projection tables, repository/service, and summary/history API.
3. Add supplier reliability summary and history to the frontend.
4. Update contract and integration tests for duplicate/out-of-order events, partial receipts, damage, changed catalog lead time, missing history, and buyer cancellation.

## Known limits

The score is an operational indicator, not a financial or contractual judgment. V1 uses the saved supplier-product lead time because there is no supplier acknowledgment workflow yet. The UI must show sample size and component metrics; buyers should be able to understand why a score changed from its delivery history.

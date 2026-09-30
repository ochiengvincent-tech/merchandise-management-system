# Phase 3 Sales Audit Service Design

## Purpose

Sales Audit controls register sessions and provides an independent, reviewable reconciliation of recorded sales and refunds against cashier-counted tender. It answers: which transactions belong to a register session, what should be in each tender category, what was counted, what variance remains, and who reviewed and approved the close?

Retail Sales remains the system of record for sales, tenders, returns, and refunds. Sales Audit owns register sessions, counted amounts, variances, explanations, and manager sign-off. It consumes durable Retail Sales events and uses a read-only Retail Sales totals contract to check event completeness before a close is approved. It never edits a sale or directly reads Retail Sales data.

## Scope and ownership

| Concern | Owner | Sales Audit relationship |
| --- | --- | --- |
| Register identity and Inventory location mapping | Retail Sales | Reference stable register/location IDs; validate through Retail Sales API when a session starts |
| Completed sales, tenders, returns, and refunds | Retail Sales | Consume immutable facts; query authoritative tender totals for a bounded register/time window |
| Register sessions, open float, counted tender, variance, close status | Sales Audit | Own and preserve each session and its reconciliation history |
| Employee identity and permissions | Future authentication platform | Use existing `x-actor-id` convention until shared authentication and role enforcement are implemented |
| Ledger, revenue, cash, and settlement accounting | Financials (Phase 4) | No journal entries or payment settlement in Sales Audit |

Each service owns its database. Cross-service references are IDs, not foreign keys. Sales Audit has its own PostgreSQL database and consumes versioned business events from the durable RabbitMQ `mms.events` bus. HTTP is used for register validation and read-only reconciliation snapshots; it is not used to mutate Retail Sales records.

## Scope

### Included in the first release

- Open one register session for an active Retail Sales register, record its opening cash float, and capture the opening actor and time.
- Attribute completed sale tenders and refund tenders to the session using the register ID and transaction occurrence time.
- Show expected totals by tender method, opening cash float, cashier counts, and variances.
- Submit a close with counted totals and an optional explanation for each non-zero variance.
- Require a different authorized manager actor to approve or reject the submitted close. Persist the decision and any reason.
- Detect duplicate event delivery and reconcile the event projection with Retail Sales' authoritative totals before approval.
- Provide searchable session history, detailed transaction references, audit history, and pending synchronization status.

### Excluded

- Recording, charging, voiding, or refunding a sale; those actions belong to Retail Sales.
- Card processor settlement, gift-card liability/balance checks, bank deposits, or accounting journal entries.
- Cash paid-in/paid-out, petty cash, safe drops, denomination-level cash counting, multi-register pooling, and cross-register cashier shifts. These may be added after their operating rules are defined.
- Editing or deleting submitted counts, approvals, or transaction history. Corrections are separate, audited actions.
- Authentication and role enforcement before the shared identity platform is available. Until then, actor IDs are recorded but are not a security boundary.

## Session and reconciliation rules

### Session lifecycle

Use the following states:

- `OPEN`: session is accepting Retail Sales events and has no submitted close.
- `SUBMITTED`: cashier has supplied counted totals; the close is immutable while reconciliation and manager review are pending.
- `APPROVED`: event coverage is reconciled and an authorized manager has approved the close.
- `REJECTED`: an authorized manager rejected the close with a required reason. A correction is represented by a new close submission/version in the same session, preserving the rejected submission and decision history.
- `EXCEPTION`: a system-detected issue (for example, late transaction event or authoritative totals mismatch) prevents approval and requires reconciliation. The session retains all facts and may return to `SUBMITTED` after the issue is resolved and totals are refreshed.

Only one session for a register may be in `OPEN`, `SUBMITTED`, `REJECTED`, or `EXCEPTION` at a time; rejection requires the cashier to submit a corrected numbered close before a new session can begin. A second session cannot begin until the previous session is approved. This prevents transaction time windows from overlapping or leaving ambiguous gaps. There is no silent reopen after approval; correcting an approved close requires a separately audited adjustment/reopen operation and reason, added only after that policy is specified.

Opening float is counted cash already in the drawer and is not a Retail Sales tender. It increases expected closing cash only. No other tender category has an opening balance in the MVP.

### Session boundaries and transaction assignment

- Persist `openedAt` from the server clock when the session is opened.
- On submission, persist a server-generated `closedAt` and a client-supplied idempotency key. Use a half-open interval `[openedAt, closedAt)` for transaction occurrence timestamps so adjacent sessions cannot both include the same transaction.
- A sale or refund belongs to the session whose register matches and whose interval contains its Retail Sales occurrence timestamp. Use the business `occurredAt` timestamp from the committed transaction event, not the time Sales Audit receives it.
- Transactions received after submission but with an occurrence time in the session interval are late events. Mark the session `EXCEPTION`, recompute totals, and require a fresh manager review. Do not drop the event or silently alter an approved result.
- A register session is a drawer/accountability period, not necessarily a cashier's employment shift. Cashier handovers and multiple cashiers per drawer can be added later with explicit handover records.

### Expected and counted totals

Store money as integer minor units and keep currency explicit. The initial Retail Sales slice uses KES. Produce one expected and counted amount for each supported method (`CASH`, `CARD`, `GIFT_CARD`) and show the overall variance.

For each method:

`expected tender = opening float (cash only) + completed sale tenders − completed refund tenders`

`variance = counted amount − expected tender`

Refunds reduce the method used for the refund. If Retail Sales records a refund through a different method, its immutable refund tender method determines the expected reduction. A negative expected balance or refund exceeding prior tender facts is an exception that must be investigated, not clamped to zero. Variance explanations are required for any non-zero method variance; zero variance may be approved without a note.

The app must label these as **recorded tender totals**. Because the current Retail Sales implementation records tender intents and does not integrate real card/gift-card processors, Sales Audit cannot claim that a card payment settled, that a gift card had sufficient balance, or that a cash deposit reached a bank.

## Event and HTTP integration

### Retail Sales event contract prerequisites

The current Retail Sales `SaleCompleted` outbox payload contains actor, location, currency, totals, lines, and sale tender method/amount, but does not contain `registerId`, `receiptNumber`, or an explicit occurrence timestamp in the payload. Its envelope has an event ID and occurrence time, but the current payload is not yet a versioned contract. The current `SaleReturned` payload contains return/sale IDs and a total refund amount but omits refund tender method/amount breakdown and a register ID. Those payloads are insufficient for register-level tender reconciliation.

Before enabling the Sales Audit consumer, Retail Sales must publish schema-versioned `SaleCompleted` and `SaleReturned` payloads with at least:

- `SaleCompleted` (payload schema version 1): sale ID, receipt number, register ID, Inventory location ID, actor ID, currency, completion time, and each recorded tender's stable ID (or stable sale-scoped reference), method, amount in minor units, and recorded outcome.
- `SaleReturned` (payload schema version 1): return ID, original sale ID, register ID, Inventory location ID, actor ID, currency, return time, and each refund tender's stable ID (or stable return-scoped reference), method, amount in minor units, and recorded outcome.

The current shared bus routes on the stable event types `SaleCompleted` and `SaleReturned`; keep those routing keys for compatibility with Inventory and Warehouse consumers. Set `payload.schemaVersion` to `1` and document the schema version in the contract. The event envelope uses `{ eventId, eventType, aggregateType, aggregateId, payload, occurredAt }`. Keep event IDs stable through retries. The sale and refund facts, audit record, and outbox row must commit atomically in Retail Sales.

### Durable event consumption

1. A dedicated queue bound to the shared exchange receives Retail Sales sale-completion and sale-return events. The Sales Audit feature flag gates both its business API and consumer.
2. Validate the envelope and versioned payload. Reject malformed or unsupported messages to a dead-letter queue with diagnostics; never acknowledge them as processed.
3. In one Sales Audit database transaction, insert the event ID into `sales_audit_processed_events`, append an immutable transaction/tender projection, and update any affected open/submitted session totals and synchronization state.
4. A duplicate event ID is a no-op. Also enforce uniqueness on source event ID plus tender reference, and on sale/return IDs as a defense against producer mistakes using new event IDs for the same aggregate fact.
5. Acknowledge only after commit. Retry transient failures with bounded retry and dead-letter handling. Sales Audit outages must not delay Retail Sales checkout or returns.

Events are authoritative for the live projection. Do not infer tender details from line totals, add refunds from the sale's original tenders, or apply a return total to cash without its refund method.

### Retail Sales authoritative totals API

Add a read-only endpoint to Retail Sales for reconciliation snapshots, for example:

`GET /api/v1/sales-audit/register-totals?registerId={id}&from={iso}&to={iso}`

It should return currency, the exact half-open query interval, sale and return counts, totals grouped by tender method and direction (`SALE` / `REFUND`), and a stable snapshot time or watermark. The result must be computed from committed Retail Sales tender/refund records, exclude pending/failed sales, and use the same occurrence timestamps and inclusion rules as events. Retail Sales serializes final sale/refund commits and this snapshot by register so a transaction cannot commit into the closed interval after a matching snapshot. The Sales Audit transaction projection provides paginated drill-down and mismatch investigation. Require service-to-service authorization when that facility exists; never accept caller-supplied expected totals as authoritative.

Before manager approval, Sales Audit compares its projection with this endpoint for the closed interval. If amounts, tender methods, or transaction counts differ, set `EXCEPTION`, refresh/replay safely, and show the discrepancy. If Retail Sales is unavailable, preserve the submitted close as pending; do not approve based on incomplete event delivery. A query snapshot/watermark must make it possible to establish that the comparison included all transactions committed by the snapshot, including events still in flight.

## Core records

Sales Audit owns a private `sales_audit_db`.

### `sales_audit_sessions`

- UUID ID, stable Retail Sales register ID and Inventory location ID references, register code/name snapshot for display, and currency.
- Status, opened/closed timestamps, opening actor, submitting actor, and optional approved/rejected manager actor.
- Opening cash float in minor units.
- Latest close submission ID, reconciliation status, last Retail Sales snapshot/watermark, and created/updated timestamps.
- Unique partial constraint allowing only one active session per register in `OPEN`, `SUBMITTED`, `REJECTED`, or `EXCEPTION`.

### Session tender totals (read model)

- The service derives expected sale/refund totals from immutable transaction tenders, adds the opening cash float, and combines them with counted amounts from the latest close submission.
- Expected totals can be rebuilt from the event projection; counted amounts remain immutable submission facts and are never rewritten by event processing.

### `sales_audit_transactions` and `sales_audit_transaction_tenders`

- Immutable reference to source event ID/type, sale or return ID, original sale ID for returns, receipt reference where available, register/location/actor IDs, currency, business occurrence time, and processing time.
- Tender rows store stable source tender reference, method, direction (`SALE` or `REFUND`), amount, and recorded outcome.
- Uniqueness constraints deduplicate source event IDs and source transaction/tender references. No Retail Sales foreign keys.
- These records support rebuild, investigation, and transaction drill-down; they are not a replacement system of record for Retail Sales.

### `sales_audit_close_submissions`

- Session ID, monotonically increasing submission number, idempotency key and request hash, submitter, server close time, counted tender amounts, variance explanations, Retail Sales comparison status/snapshot, and submission time.
- Preserve every submission, approval, and rejection. A retry with the same key and body returns the original result; reusing a key with a different body returns `409`.

### `sales_audit_decisions`, `sales_audit_logs`, `sales_audit_processed_events`

- Decision rows preserve manager approve/reject actions, actor, reason, and timestamp; manager must differ from submitter.
- Audit logs record session open, close submission, reconciliation exception/resolution, approval/rejection, and any authorized post-approval correction with before/after references.
- Processed event IDs and event types are committed atomically with their transaction/tender projections.
- No outbox is needed for MVP if Sales Audit publishes no business events. Add a transactional outbox before introducing consumers that rely on session-approved facts.

## API outline

All routes are under `/api/v1`; errors use the MMS canonical shape `{ error: { message, details?: [{ field?, message }] } }`. List endpoints are paginated and use stable ordering.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/registers` | List/validate Retail Sales registers with current session status |
| POST | `/sessions` | Open a register session with opening cash float; requires `Idempotency-Key` and `x-actor-id` |
| GET | `/sessions` | Search sessions by register, status, actor, and date |
| GET | `/sessions/:id` | Read session totals, transactions, counts, variances, sync status, and decisions |
| POST | `/sessions/:id/submit` | Submit counted totals and variance explanations; requires `Idempotency-Key` and `x-actor-id` |
| POST | `/sessions/:id/approve` | Manager approval after complete reconciliation; requires `x-actor-id` |
| POST | `/sessions/:id/reject` | Manager rejection with required reason; requires `x-actor-id` |
| GET | `/sessions/:id/transactions` | Paginated sale/refund references and tender facts for a session |
| GET | `/audit-logs` | Paginated Sales Audit action history |
| GET | `/health`, `/ready` | Liveness and database/broker/dependency readiness |

The client cannot set server timestamps, expected amounts, variances, reconciliation status, or approval identity. Use API schemas and examples in `contracts/openapi/sales-audit.yaml` before wiring the frontend.

## Frontend workflow

1. **Open register:** choose an active register with no active session, enter starting cash float, and confirm. Show the actor and opening time.
2. **Live session:** show opening float, expected sale/refund tender totals, current event synchronization, and transaction list. Clearly mark totals as provisional while the session is open.
3. **Submit close:** enter counted totals per tender method, show calculated variances, and require an explanation for each non-zero variance. Once submitted, keep the submitted counts immutable.
4. **Review:** manager sees the counts, expected totals, detailed transactions, variances, explanations, and Retail Sales comparison status. Disable approval while events are pending, the totals snapshot is unavailable, a mismatch exists, or the manager is the submitter.
5. **Resolve/reject:** show late events and source-total differences clearly. A rejected submission can be corrected in a new numbered submission without erasing the rejection.
6. **History:** search past sessions and inspect the complete transaction, count, variance, and decision history.

Use the shared Coming Soon route gate and sidebar conventions. The UI must never suggest that recorded card/gift-card amounts are settled funds.

## Configuration, deployment, and feature flag

- Create `services/sales-audit` as a separately deployable service with a dedicated database, migrations, canonical error middleware, health/readiness endpoints, event consumer, retry/dead-letter behavior, and OpenAPI contract.
- Reserve port `3007` for Sales Audit. Existing documented ports are Retail Sales `3006`, Warehouse Operations `3005`, and prior services `3001`–`3004`.
- Add a dedicated `sales-audit-db` database and persistent volume in Compose, using local-only development credentials consistent with other services.
- Configure `DATABASE_URL`, `PORT`, `FEATURE_SALES_AUDIT_ENABLED`, Retail Sales API base URL, service credentials when available, RabbitMQ URL/queue prefix, and retry settings in `services/sales-audit/.env.example` and the root example configuration.
- Use `FEATURE_SALES_AUDIT_ENABLED` and the existing frontend `VITE_FEATURE_SALES_AUDIT_ENABLED`, both defaulting to false. When disabled, do not register business routes or the event listener; hide navigation and gate direct routes with the shared Coming Soon page.
- Add Sales Audit migrations to the documented migration workflow without coupling its database to Retail Sales.

## Implementation sequence

1. Finalize versioned sale/refund event schemas and examples. Extend Retail Sales events with register and tender/refund references and add occurrence timestamps consistently.
2. Implement Retail Sales' read-only, register/time-window tender totals endpoint and define snapshot/watermark semantics. Update its OpenAPI contract.
3. Scaffold `services/sales-audit`, its dedicated database/migration/configuration, feature flag, health/readiness and canonical errors.
4. Implement versioned event validation, durable queue, idempotent projections, session and tender tables, audit trail, and reconciliation snapshot client.
5. Implement session open, submit, compare, approve/reject flows with server-side invariants and idempotent mutation requests.
6. Add OpenAPI schemas and event examples, then feature-flagged UI for live session, close, manager review, and history.
7. Enable the consumer only after Retail Sales emits the required contracts. Verify duplicate/out-of-order/late events, lost responses, source outage, concurrent register opens, refund method totals, mismatches, and manager separation.

## Key invariants

- Retail Sales is authoritative for sale and refund transactions; Sales Audit owns the close and count evidence.
- A session belongs to exactly one register and one non-overlapping server-timestamped interval.
- Each committed sale/refund tender contributes at most once to the expected totals for its method and direction.
- Opening float contributes only to expected cash; refunds reduce the exact tender method recorded by Retail Sales.
- Counts and decisions are immutable historical facts. Corrections create additional submissions or explicit audited decisions.
- A close cannot be approved until its event projection matches a complete authoritative Retail Sales snapshot.
- A manager cannot approve their own close submission. Until authentication/roles exist, the recorded actor header alone does not enforce this security rule.
- Event delivery or Sales Audit outages never block sale/return completion and do not discard reconciliation work.
- Recorded tenders are not proof of external payment settlement or bank deposit.
- No service reads or writes another service's database; all cross-service integration uses versioned APIs and durable events.

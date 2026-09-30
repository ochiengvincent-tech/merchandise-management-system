# Financials Service Design

**Status:** initial implementation available; finance policy confirmation and production validation remain
**Scope basis:** current service code and published event payloads in this repository

## Purpose

Financials owns the general ledger and financial subledgers for MMS. It turns committed operational facts into traceable accounting entries and provides balanced financial reports. It must not become a second source of truth for purchase orders, receipts, stock, sales, returns, or register counts.

The first release should establish a reliable, append-only ledger and post only from authoritative business facts. Accounts payable can record and match supplier invoices, but a purchase order or goods receipt alone is not a supplier invoice or a payment. Financials must never imply that a recorded Retail Sales tender settled through a processor or bank.

## Ownership and service boundaries

| Concern | Owner | Financials relationship |
| --- | --- | --- |
| Suppliers, terms, vendor identity | Vendor Management | Store vendor ID and display snapshot; read through its API when needed |
| Purchase orders and approved prices | Procurement | Use IDs and immutable event facts; never edit POs |
| GRNs, accepted/damaged counts, receipt prices | Receiving | Use `GoodsReceived` as the receiving fact |
| Product/location on-hand and moving-average unit cost | Inventory | Inventory remains authoritative; publish a cost-impact fact before Financials posts stock value changes |
| Bin-level physical stock | Warehouse Operations | Not a separate ledger valuation source |
| Completed sale and refund tenders, sales tax and revenue values | Retail Sales | Consume committed, versioned events; no direct database access |
| Register count, variance, and manager close decisions | Sales Audit | Operational close evidence; not a source for sale recognition |
| Chart of accounts, journals, payable invoices, financial periods and reports | Financials | Own and preserve |
| User identity, roles, posting-period permissions | Shared identity platform (future) | Record actor IDs; authorization remains deferred until the platform exists |

Each service keeps its own database. Cross-service IDs are references only, not foreign keys. Financials consumes events over the existing durable `mms.events` bus and stores its own inbox and projection state.

## First-release scope

### Included

- Configurable chart of accounts with a small seeded KES chart for the initial business.
- Balanced, immutable journal entries with source event references, posting rules, accounting date, actor/source, and reversal links.
- Idempotent event ingestion and a visible exception queue for malformed, incomplete, or unmapped source facts.
- Receipt accrual to inventory and goods-received-not-invoiced (GRNI), once Inventory supplies an authoritative cost-impact event.
- Sales, refunds, tender clearing, and sales-tax postings from committed Retail Sales facts.
- Supplier invoice capture, PO/GRN matching, approval state, and accounts-payable balances. Invoices do not initiate supplier payment in the first release.
- Trial balance and date-range income statement, with drill-down to journal and operational source references.
- Explicit period close/reopen actions that are reasoned, audited, and never silently rewrite posted entries.
- Health/readiness, a dedicated database and migrations, feature flag, OpenAPI specification, and web screens for finance operations and reports.

### Excluded

- Bank feeds, bank reconciliation, card-processor settlement, gift-card balance/issuance, payment execution, payroll, fixed assets, budgets, multi-company consolidation, foreign-exchange revaluation, and tax filing.
- Editing or deleting posted journals. Corrections use reversing and replacement entries.
- Calculating stock cost independently from Inventory or deriving cost of goods from Retail Sales' retail prices.
- Automatic payment of an invoice based on a goods receipt or PO approval.
- Tax advice or hard-coded statutory tax rates. Tax accounts and treatment must be configured from a finance-approved policy.

## Accounting invariants

1. A posted journal balances by currency: total debits equal total credits.
2. Amounts are integer minor units at API and event boundaries. Persist exact decimal/numeric amounts or integer minor units; never use floating-point arithmetic for posting.
3. A posted journal and its lines are immutable. Correcting it appends a linked reversal and, when needed, a replacement.
4. At most one posting is created for a source event and posting-rule version. Re-delivery is a no-op; a new rule version requires an explicit replay/rebuild procedure.
5. A journal uses one currency. Cross-currency journals and FX gain/loss are deferred.
6. Financials accepts only committed business events and approved invoice commands. Purchase-order approval does not create an expense or payable.
7. A financial posting is not evidence of payment settlement. Tender methods map to clearing accounts until a future settlement integration reconciles them.
8. An event with missing monetary inputs, an unknown account mapping, or an unsupported schema is retained as an exception; it is not acknowledged as successfully posted.
9. No source database is read directly. Corrections and replays use published facts and explicit reference APIs only.

## Posting policy proposal

Use a configurable posting-rule table that maps event type, source dimensions, currency, and tax/category codes to accounts. Seed the initial mapping, but require a finance operator to confirm it before the posting consumer is enabled.

| Operational fact | Proposed debit | Proposed credit | Rule |
| --- | --- | --- | --- |
| Accepted receipt with authoritative Inventory carrying value | Inventory asset | GRNI liability | Post accepted quantity at the cost fact supplied by Inventory. Do not post the ordered amount on PO approval. |
| Approved supplier invoice matched to receipt(s) | GRNI and configured recoverable-tax account | Accounts payable | Match invoice lines to PO and accepted GRN quantities. Variances above configured tolerances go to review; do not silently change inventory cost. |
| Sale completed | Cash-on-hand clearing, card clearing, or gift-card clearing by recorded tender | Sales revenue and sales-tax payable by source tax breakdown | Use immutable Retail Sales line/tender values. “Clearing” is not a claim that funds reached a bank or processor. |
| Refund recorded | Sales returns/allowances and sales-tax payable reversal, proportionally by original sale tax allocation | Tender clearing by recorded refund method | Use Retail Sales refund amounts and tender breakdown. |
| Inventory cost consumed by sale | Cost of goods sold | Inventory asset | Requires a cost snapshot emitted by Inventory at the moment stock is consumed. Do not derive from selling price or a later stock query. |
| Inventory write-off or adjustment | Configured shrinkage/variance or inventory asset account | Inventory asset or configured variance account | Requires an authoritative cost delta from Inventory and a reason. Warehouse bin movements alone have no financial effect. |
| Supplier credit note | Accounts payable / configured tax reversal / inventory or expense adjustment | Accounts payable / related accounts | Only after invoice and receipt linkage plus an approved reason are present. |

The exact account mapping is a finance-owned configuration. A posting must remain in an exception state if its mapping is not configured.

## Event and integration requirements

### Existing source facts

- Retail Sales publishes `SaleCompleted` with `schemaVersion: 1`, line subtotal/tax/total values, and recorded tender IDs, methods, amounts, and outcomes. It publishes `SaleReturned` with refund tender details. These are sufficient for revenue/refund postings, subject to a finance-approved tax-account mapping.
- Receiving publishes `GoodsReceived` with PO and GRN references, accepted/damaged quantities, currency, and PO unit price. Financials does not infer carrying value from that event; it consumes Inventory’s authoritative valuation event after Inventory applies its cost policy.
- Inventory uses moving weighted-average cost and publishes signed carrying-value deltas for receipts, sale consumption, sellable returns, and adjustments. A migration emits opening valuations for existing on-hand stock; returns without a captured historic cost remain explicit posting exceptions.
- Sales Audit stores register close and variance records but does not currently publish an approved-close business event. Financials must not wait on close approval to recognize a committed sale. The close is a separate operational control.

### Required Inventory cost event

Before Financials posts inventory assets or cost of goods, Inventory publishes a versioned, immutable cost-impact event in the same transaction as the corresponding Inventory stock/cost update: `InventoryValuationChanged`. Existing stock is represented by opening valuation events emitted by the Inventory migration.

Minimum payload:

- `schemaVersion`, stable `eventId`, event type, aggregate and occurrence time.
- `sourceType` and `sourceId` (receipt, sale, return, adjustment, or write-off) and source event ID.
- product, location, currency, signed quantity delta, exact signed carrying-value delta in minor units, and the costing-policy/version identifier.
- an explicit reason/classification such as `RECEIPT`, `SALE_CONSUMPTION`, `RETURN_RESTOCK`, or `WRITE_OFF`.
- for a sale, the source sale ID and the exact inventory cost recognized for the consumed quantity.

Inventory must compute the value delta while it owns and locks the affected stock row. Financials must not call Inventory after receiving the event to reconstruct historical cost. If a later correction changes cost, Inventory publishes a separate compensating cost event.

### Supplier invoice intake and matching

No supplier invoice source exists in the current service code. Financials therefore needs an explicit invoice command/API rather than inferring an invoice from a PO or GRN.

- Capture supplier invoice number, vendor ID, invoice date, due date, currency, tax summary, attachment reference, and invoice lines referencing PO lines and one or more GRN lines where applicable.
- Verify supplier and PO/GRN references with Vendor Management, Procurement, and Receiving APIs. Store IDs and a limited display snapshot; do not create cross-database foreign keys.
- Support draft, matched, exception, approved, and posted states. A duplicate vendor/invoice number is rejected within the agreed legal entity.
- Match quantities received and prices against accepted receipt facts. Over-receipts, duplicate invoice quantities, price/tax differences, and non-PO invoices enter a review queue.
- Approval is required before the AP journal posts. Until shared authentication exists, actor IDs are audit metadata, not enforceable roles.
- Supplier payments and remittance are out of scope. AP balances are obligations only and must not be described as paid.

### Event processing guarantees

1. Each Financials consumer uses its own durable queue bound to `mms.events` and only subscribes to approved event types.
2. Validate envelope and payload versions. Unknown versions go to a diagnosable dead-letter path.
3. In a single Financials database transaction, record the processed event, create journal header/lines, and store source-to-journal mapping.
4. Acknowledge after commit only. Use bounded retries and dead-letter handling for transient processing failures.
5. Unique constraints on event ID, source business fact, and posting-rule version prevent duplicates from retries or producer mistakes.
6. Never couple a source service's user-facing transaction to Financials availability. A late posting remains observable and can be replayed without changing source facts.

## Data model proposal

Financials owns a private `financials_db`.

### `financial_accounts`

- UUID ID, stable account code, name, account type (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`), normal balance, currency policy, active state, and optional parent ID.
- Unique account code; prohibit deleting an account already referenced by posted lines.

### `financial_periods`

- Period start/end, status (`OPEN`, `CLOSING`, `CLOSED`), closed actor/time, and reopen reason/history.
- Reject backdated posting to a closed period unless an explicitly authorized reopen operation is recorded.

### `financial_journals` and `financial_journal_lines`

- Journal source, business/accounting dates, currency, status, description, source IDs, event ID, posting-rule version, correlation ID, reversal linkage, and created/posted metadata.
- Lines contain account ID, debit/credit minor units, dimensions (location/product/vendor where permitted), memo, and immutable source detail.
- Database constraints and a posting transaction ensure positive line amounts and balanced journal totals before status becomes `POSTED`.

### `financial_processed_events` and `financial_posting_exceptions`

- Processed event ID/type/version/time and resulting journal IDs.
- Exception source reference, raw validated-safe payload, reason code, retry state, and resolution audit. Exclude credentials, payment secrets, and unnecessary customer data.

### `financial_posting_rules`

- Versioned source/action/dimension matching criteria and account mapping. Rule changes apply prospectively by default; historical rebuilds require an explicit controlled operation.

### `financial_supplier_invoices` and invoice lines

- Vendor/invoice unique key, source PO/GRN references, invoice and due dates, currency, tax totals, attachment/document reference, lifecycle status, approval metadata, and matched/remaining quantities/amounts.
- Persist invoice revisions as auditable history. Posted invoices are corrected through credit notes or reversal documents, not edits.

### `financial_audit_logs`

Record account/rule changes, invoice state transitions, period close/reopen, exception resolution, posting/reversal, and any controlled replay with actor, time, source, and before/after references.

## API outline

Base path: `/api/v1`. Use the shared MMS error shape. Mutating commands require an idempotency key and actor ID; actor IDs are not authorization until the shared identity platform is implemented.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/accounts` | Search chart of accounts |
| POST | `/accounts` | Create an account before first use; later changes are audited |
| GET | `/journals` | Filter by source, account, period, actor, status, and date |
| GET | `/journals/:id` | Read immutable header, lines, and source references |
| POST | `/journals/:id/reverse` | Create a linked reversal for an eligible posted journal |
| GET | `/reports/trial-balance` | Balanced debit/credit totals by account and period/date |
| GET | `/reports/income-statement` | Revenue, contra-revenue, and expenses for a date range |
| GET | `/reports/inventory-value` | Financial carrying value by location/product from posted journal lines |
| GET | `/supplier-invoices` | Search draft, exception, approved, and posted invoices |
| POST | `/supplier-invoices` | Record an idempotent supplier invoice draft |
| POST | `/supplier-invoices/:id/match` | Match invoice lines against PO and accepted GRN quantities/prices |
| POST | `/supplier-invoices/:id/approve` | Approve a matched invoice and post AP journal |
| POST | `/periods/:id/close` | Close an eligible period after validation and audit |
| POST | `/periods/:id/reopen` | Reopen with an explicit reason and elevated authorization when available |
| GET | `/posting-exceptions` | Review incomplete, mismatched, or unmapped source facts |
| POST | `/posting-exceptions/:id/retry` | Retry after source/rule correction without duplicating journals |
| GET | `/audit-logs` | Paginated Financials audit history |
| GET | `/health`, `/ready` | Liveness and database/broker readiness |

## UI outline

- **Finance overview:** current-period debits/credits, unposted exceptions, GRNI and AP balances, and latest close state.
- **Journal browser:** filterable list, immutable detail, source event reference, and reversal history.
- **Supplier invoices:** draft capture, match results, exceptions, approval, and posted journal link.
- **Reports:** trial balance, income statement, and inventory carrying value with explicit currency and date range.
- **Period close:** readiness checklist, unresolved exception count, debits/credits balance, and close/reopen history.
- Use the shared feature-gate and app theme. Never label a clearing entry as a bank deposit or invoice as paid without a settlement fact.

## Configuration and rollout

- Create `services/financials` with a dedicated PostgreSQL database, migrations, health/readiness, canonical error handling, RabbitMQ consumer, retry/DLQ support, and OpenAPI contract.
- Reserve service port `3008`; add `financials-db` and persistent volume to Compose.
- Add `FEATURE_FINANCIALS_ENABLED=false` and `VITE_FEATURE_FINANCIALS_ENABLED=false` defaults. Keep APIs, consumers, navigation, and routes disabled until mappings and event prerequisites are ready.
- Add local `.env.example`, app API URL/proxy, service scripts, and documented migration/setup commands.
- Start consumers in observe-only mode or behind a posting switch until finance has approved the chart and mapping. Enable posting per event type after reconciliation against sample source facts.

## Implementation sequence

1. Confirm ledger currency, entity/location dimensions, account ownership, tax mapping, inventory cost policy, and period-close authority.
2. Define/version the Inventory cost-impact event and add producer outboxes atomically with source updates. Financials uses Inventory valuation events rather than treating `GoodsReceived` as a carrying-value fact. (Implemented, including opening stock valuation.)
3. Scaffold Financials DB, chart, periods, immutable journal model, balanced-posting transaction, idempotent inbox, canonical API errors, and health checks. (Implemented; finance policy review remains.)
4. Seed an approved chart and posting rules. Add journal APIs and trial-balance report before enabling automated postings.
5. Consume Inventory cost facts and Retail Sales sale/refund facts. Reconcile source event counts and values against Inventory valuation and Retail Sales totals before enabling the posting switch. (Consumer and source feeds implemented; reconciliation and finance sign-off remain before enabling postings.)
6. Add supplier invoice capture, PO/GRN matching, approval audit, AP posting, and exception workflow. Do not add payment execution in this slice. (Capture, multi-line matching, approval UI, and guarded AP posting implemented.)
7. Add report and invoice UI behind the Financials feature flag; publish OpenAPI and event examples. (Implemented.)
8. Verify duplicates, out-of-order events, late events, unmapped accounts, tax rounding, partial receipts, invoice over/under-match, reversals, closed-period writes, negative values, and consumer/database outages before production use.

## Decisions to confirm before implementation

- Is MMS initially one legal entity and one base currency (KES), or must the chart and reports support multiple entities/currencies from day one?
- Should Inventory's current moving weighted-average cost become the formal costing method, and how should damaged, quarantined, returned, and written-off quantities affect carrying value?
- Which approved account map and tax categories/rates should be used, including recoverable input tax and sales tax treatment?
- Who owns supplier invoice data/document storage, tolerance policy, and approval thresholds? Is Financials the invoice record owner for the first release?
- What is the financial period calendar, backdating rule, and authority to close/reopen periods?
- Are retail cash/card/gift-card tender records eligible for revenue posting before external payment/cash settlement integration? The proposal posts to method-specific clearing accounts and does not claim settlement.

These are finance/product policy decisions. The service can be scaffolded before all are final, but automated postings must remain disabled until the relevant mappings and source facts are approved. The concrete sign-off matrix is in [financials-finance-approval.md](financials-finance-approval.md).


## Implementation status (2026-09-30)

The initial Financials service, guarded UI workflows, OpenAPI contract, supplier invoice capture/match/approval, ledger review, inventory valuation feed, opening-stock snapshot, and Retail Sales refund-tax allocation are implemented. Event retries are bounded and route exhausted or invalid messages to the Financials dead-letter queue. Posting and the feature remain disabled by default. Finance must confirm account mappings, tax treatment, moving-average costing policy, period control, and reconciliation before posting is enabled. Shared authentication/authorization and payment execution remain outside this release.

# Phase 3 Retail Sales and POS Service Design

## Purpose

Retail Sales is the transaction engine for the customer-facing storefront. It answers: what was sold, at which store and register, to whom when recorded, at what price, and how the customer paid?

This design follows the project assignment's Scenario 4: Retail Sales checks availability with Inventory, reserves stock before taking payment, records a completed sale, then publishes a sale event for Inventory, Sales Audit, and the later Financials service.

## Scope and ownership

| Concern | Owner | Retail Sales relationship |
| --- | --- | --- |
| Product identity, SKU, active status | Inventory | Read and validate via Inventory API; store ID and sale-time display snapshot |
| Aggregate stock and availability | Inventory | Check and reserve before sale; never write Inventory data directly |
| Bins and physical placement | Warehouse Operations | Not managed by POS; checkout sells from the store's Inventory location |
| Retail selling price, promotions, tax calculation | Retail Sales | Own price and promotion records and snapshot applied values on each sale |
| Wholesale price, supplier terms, purchase orders | Vendor Management / Procurement | Never use supplier cost as the retail selling price |
| Sales, tenders, voids, returns | Retail Sales | Authoritative transaction records |
| Register close, expected-vs-counted reconciliation, manager sign-off | Sales Audit | Consume completed-sale/refund events and query Retail Sales totals |
| Ledger, inventory asset, COGS, revenue | Financials (Phase 4) | Consume versioned sale/refund events; no accounting writes in POS |
| User identity and roles | Future authentication platform | Use existing `x-actor-id` convention until authentication is implemented |

Each service owns its database. Cross-service references are IDs, not foreign keys. Service-to-service reads and commands use versioned HTTP APIs; committed business facts use the durable RabbitMQ `mms.events` bus and a transactional outbox.

## Implemented vertical slice

The current implementation provides register setup, active product search with store stock visibility, effective-dated retail prices with configurable tax rates, cash checkout, completed-sale history, partial returns with original-price refunds, and idempotent SaleCompleted/SaleReturned events. Card and gift-card tender types are accepted by the API as recorded tenders, but the UI currently records cash only. Promotions, external payment/refund settlement, Sales Audit, and Financials remain deferred.

## Phase 3 target

1. Store and register setup sufficient to identify the Inventory location and tender totals for each checkout. Register IDs are owned by Retail Sales; register close and sign-off remain Sales Audit responsibilities.
2. Retail price records with currency, effective dates, and active state. A checkout must use the price effective at the sale time. Supplier catalog prices are purchase costs and must not be copied as retail prices.
3. A cashier POS flow: find/scan product, select quantity, see price/tax/total, check availability, record tender, complete, and show a receipt view.
4. Tenders recorded per sale, supporting cash, card, gift card, and split tender as the assignment specifies. For the MVP, record the tender method, amount, reference, and outcome. A real card processor or gift-card balance integration is a separate integration; the UI must not imply that an external payment was actually charged when it was only recorded.
5. Searchable sale history and receipt detail.
6. Full and partial returns referencing an original completed sale, with tender refund records and a stock disposition decision for each returned line.
7. Persisted audit records for important changes and transactional outbox events for completed sales and returns.
8. Frontend feature flag `VITE_FEATURE_RETAIL_SALES_ENABLED` and backend `FEATURE_RETAIL_SALES_ENABLED`; disabled service links stay out of navigation and direct routes show the common Coming Soon page, consistent with other later-phase services.

## Deferred

- Sales Audit reconciliation and manager sign-off (separate Phase 3 service; consume Retail Sales events and use a documented expected-totals query contract).
- Financial postings, accounts receivable, and COGS (Phase 4).
- Promotion/discount rules and coupons. The current vertical slice prices at effective-dated retail rates and records tax; it does not apply sale discounts.
- Real payment gateway integrations, gift-card issuance/balances, offline card authorization, and chargebacks. Tender/refund records represent amounts recorded by the cashier, not external settlement.
- Customer accounts, loyalty, ecommerce, delivery, layaway, exchanges spanning multiple tenders, and multi-store carts.
- Advanced promotion stacking, coupons, price optimization, and retail price imports.
- Authentication and role-based permission enforcement until the shared authentication design is implemented.

## Core records

- **Retail price:** product ID, currency, amount in minor units, effective-from/to timestamps, active state, actor and audit history. Prevent overlapping active price windows for a product/currency unless a documented priority rule is later introduced.
- **Promotion:** identifier, name, kind, value, time window, eligible products (or explicit all-products scope), and active state. Store applied promotion IDs and discount amounts on sale lines; later edits never rewrite old sales.
- **Register:** stable ID, code/name, Inventory location ID, active state. Register configuration is distinct from opening/closing a cash drawer; drawer sessions belong to Sales Audit.
- **Sale:** immutable transaction number, register/location, cashier actor, currency, status, subtotal, discounts, tax, total, idempotency key, timestamps, and optional customer reference. Do not collect customer PII in Phase 3 without an approved requirement.
- **Sale line:** product ID and sale-time name/SKU snapshot, quantity, unit price, line discount, tax, and final amount. Use integer quantities initially, matching Inventory's stock contract. Store money as integer minor units and define a single rounding rule.
- **Tender:** sale ID, method, amount, currency, provider/reference when available, and status. A sale can have multiple tenders; successful tender amounts must equal the amount due before completion.
- **Return:** original sale ID, immutable return number, actor, reason, status, refund total, and idempotency key; return lines point to original sale lines and cannot cumulatively exceed sold quantities less earlier returns.
- **Return line/disposition:** quantity, refund amount, and one of `RESTOCK_SELLABLE`, `QUARANTINE`, or `NO_STOCK_RETURN`. Only an explicit sellable disposition can increase sellable Inventory stock. Warehouse's quarantine workflow remains separately governed.
- **Audit record/outbox event:** actor, action, record reference, timestamp, and relevant before/after details; outbox row commits in the same database transaction as its sale/return.

All totals are computed server-side from persisted prices and promotion rules. The browser may preview totals but cannot set authoritative totals, discounts, tax, or tender success.

## Sale lifecycle and inventory coordination

A checkout is a small distributed workflow; there is no cross-service database transaction. Use a persisted sale attempt and compensation rather than pretending the two databases commit atomically.

1. Browser sends checkout with an `Idempotency-Key`, register, lines, and tender intents. Backend resolves each product and price from its owners and recalculates every amount.
2. Retail Sales persists an attempt in `PENDING_STOCK` and its request hash. A replay with the same key/body returns or resumes that attempt; same key with different body returns `409`.
3. Retail Sales requests Inventory to reserve each product/quantity at the register's location. Inventory is authoritative and must reject inactive products, insufficient availability, or a disabled location. Reservation commands need idempotency and a stable sale-attempt reference. If any line cannot be reserved, release successful reservations and leave no completed sale.
4. Once stock is reserved, validate and record tender outcomes. If tender is declined or cancelled, release reservations and mark the attempt failed/cancelled. Retry behavior must not double-charge: real payment providers require their own idempotency key and reconciliation contract before integration.
5. In one Retail Sales DB transaction, mark the sale complete, persist lines/tenders/audit, and insert `SaleCompleted.v1` in the outbox. Return the completed receipt only after this transaction commits.
6. Inventory consumes `SaleCompleted.v1` idempotently and atomically reduces on-hand and allocated by the sold quantity. An event consumer failure does not erase the sale; the queue retries and the allocation continues to protect availability. Surface inventory synchronization state in operational diagnostics.
7. Sales Audit and Financials consume the same versioned event independently. Their failure must not roll back or block an already completed sale.

**Required Inventory contract addition:** current Inventory supports allocate and release, but the inspected endpoints do not provide an idempotent “consume this reservation” operation or a sale-event consumer. Before checkout is considered complete, add the corresponding Inventory event handling (preferred, matching the assignment) or an Inventory-owned idempotent finalize-reservation API. Do not call `allocate` and then directly decrement stock from Retail Sales. This is a documented integration prerequisite, not something Retail Sales may bypass.

For this contract, Inventory must correlate a sale line/reference to its reserved quantities, reject consumption beyond the reservation, deduplicate event IDs, and commit stock, audit, and processed-event state atomically. It must not consume the same sale twice.

## Returns

1. Cashier looks up the original completed sale and selects remaining returnable quantities.
2. Retail Sales verifies quantities against the original lines and all prior returns, calculates refund using the original sale-time price/tax/discount policy, and validates tender/refund rules.
3. Persist the return, tender refund record, audit, and `SaleReturned.v1` outbox event atomically. If an external refund provider exists later, use a persisted pending/refund state and provider idempotency; do not report refunded before provider confirmation.
4. Inventory handles the event idempotently. Sellable goods may be added through an Inventory-owned return command; damaged or otherwise unsellable goods must be recorded into a non-sellable Warehouse disposition. If that contract does not exist yet, return completion must explicitly leave the inventory disposition pending and must not silently add stock.
5. Sales Audit subtracts refund tenders from expected totals; Financials later records the reversal through its own consumer.

## API outline

All routes are under `/api/v1` and use the project's canonical error shape `{ error: { message, details?: [{ field?, message }] } }`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/registers` | List active registers and their Inventory locations |
| POST | `/registers` | Create a register/location mapping (setup permission later) |
| GET | `/products/search?q=` | Search active Inventory products for checkout |
| GET | `/prices?productId=&at=` | Read effective retail price and eligible promotions |
| PUT | `/products/:productId/prices` | Create/update future-effective retail prices; preserve history |
| GET | `/sales` | Search completed sales by register, actor, date, or receipt number |
| GET | `/sales/:saleId` | Read receipt/sale details and tender summary |
| POST | `/sales` | Idempotent checkout; requires `Idempotency-Key` and `x-actor-id` until auth |
| POST | `/sales/:saleId/returns` | Idempotent full/partial return; requires original sale reference |
| GET | `/sales-audit/register-totals` | Read-only expected tender totals for Sales Audit (contract to be agreed between services) |
| GET | `/health`, `/ready` | Liveness and dependency readiness |

The exact HTTP payloads should be finalized alongside OpenAPI schemas before implementation. APIs must paginate searches and never expose another service's database model wholesale.

## Events

Use the shared envelope `{ eventId, eventType, aggregateType, aggregateId, payload, occurredAt }`; version payloads from the first release and include schema examples/contracts in the repository.

- **`SaleCompleted.v1`**: sale ID/receipt number, register ID, Inventory location ID, cashier actor ID, currency, completed timestamp, line product IDs and quantities, price/discount/tax/final line amounts, tender method/amount summaries, and idempotency/reference data. Avoid customer PII. This event drives Inventory consumption, Sales Audit expected totals, and future Financials postings.
- **`SaleReturned.v1`**: return ID, original sale ID, register/location, actor, currency, return time, returned line quantities/refund amounts/disposition, and tender refund summaries. Drives Inventory restock/disposition, Sales Audit tender reversal, and future Financials reversal.

Publish via a transactional outbox. Consumers persist event IDs and their effects atomically, acknowledge only after commit, and tolerate replay. A sale event should be a durable business fact; it must not be sent as a transient fire-and-forget message.

## Audit events

Record at least: `RETAIL_PRICE_CREATED`, `RETAIL_PRICE_CHANGED`, `PROMOTION_CREATED`, `PROMOTION_CHANGED`, `REGISTER_CREATED`, `SALE_COMPLETED`, `SALE_VOIDED` (only under explicit pre-settlement policy), `RETURN_RECORDED`, and `REFUND_RECORDED`. Include actor ID, record ID, timestamp, reason where applicable, and useful before/after values. Never edit or delete completed sale, tender, return, or audit history. Corrections use compensating records.

## Frontend workflow

- **POS:** choose register, search/scan products, edit quantities, review available-to-sell status, show itemized prices/discounts/tax/total, record one or more tenders, and confirm sale. Disable repeat submit while pending; show clear stock, payment, and synchronization errors.
- **Receipt:** show receipt number, items, totals, tender summary, cashier/register, and return entry point.
- **Sales history:** search/filter receipts and inspect immutable line and tender details.
- **Returns:** select quantities from original receipt, choose stock disposition where allowed, show refund amount before confirmation, and display refund/inventory pending states honestly.
- **Pricing setup:** restricted setup route for effective-dated retail prices and simple promotions; visible change history.
- Keep Sales Audit as a separate navigation/service. POS may show current shift/register context but must not claim to reconcile or close a drawer.

## Configuration, deployment, and sequencing

- `services/retail-sales` is implemented as an independent service/database with migrations, health/readiness endpoints, canonical error handler, audit store, and transactional outbox. Inventory and Warehouse consume its sale/return events idempotently with retry/DLQ behavior.
- Add a dedicated database and port in infrastructure; avoid colliding with Warehouse Operations (`3005`). Reserve/document distinct ports for Retail Sales and Sales Audit before both are implemented.
- Document `DATABASE_URL`, `PORT`, `FEATURE_RETAIL_SALES_ENABLED`, Inventory base URL, RabbitMQ settings, and outbox/retry settings in `.env.example`; do not commit real credentials.
- Frontend reads the existing `VITE_FEATURE_RETAIL_SALES_ENABLED`, shows the nav item only when enabled, and gates direct routes with the shared Coming Soon page.
- Next implementation steps: add machine-readable OpenAPI contracts; connect Sales Audit to sale/refund totals; add promotion/discount rules and actual payment/refund provider integrations only when their business and provider policies are defined.

## Key invariants

- Inventory is the sole authority for available stock; a sale cannot complete without a successful reservation.
- Retail Sales owns selling prices. Each sale preserves the exact price, promotion, tax, and tender facts used at completion.
- Repeated checkout/return requests cannot create duplicate sales, charges, refunds, inventory changes, or events.
- Recorded tender totals must equal the due amount to complete a sale; refunds cannot exceed the original sale amount or remaining returnable quantities.
- Stock consumption/restock is performed only by Inventory-owned contracts and event consumers; services never mutate another database.
- A completed sale remains completed when a downstream consumer is temporarily unavailable; durable events retry and surface pending synchronization where relevant.
- Audit, sale/return records, and their outbox events are committed together.
- Register cash reconciliation and manager approval belong to Sales Audit, not POS.

# Retail Sales Service

Retail Sales owns registers, retail price histories, completed sales, refunds, recorded tender, and its audit/event outbox. It validates products, store locations, and stock reservations through Inventory APIs; it never reads another service's database. Amounts are stored as integer KES minor units.

## Local development

1. Start PostgreSQL, RabbitMQ, and Inventory with `pnpm infra:up` and the relevant service commands.
2. Copy `.env.example` to `.env`; configure `DATABASE_URL`, `INVENTORY_API_URL`, and `RABBITMQ_URL`.
3. Apply schema with `pnpm --filter @mms/retail-sales db:migrate`.
4. Set `FEATURE_RETAIL_SALES_ENABLED=true` for the service and web app when ready to use it.
5. Start with `pnpm --filter @mms/retail-sales dev`.

Retail Sales listens on port `3006`; the web development proxy exposes `/api/retail-sales` and rewrites it to `/api/v1`.

## API routes

- `GET/POST /api/v1/registers` list active registers and create a store register.
- `GET /api/v1/products/search` searches Inventory products, optionally with register stock.
- `GET /api/v1/prices` reads an effective price; `PUT /api/v1/prices/:productId` creates a non-overlapping effective price.
- `POST /api/v1/sales` completes an idempotent checkout after stock reservation; `GET /api/v1/sales` and `GET /api/v1/sales/:id` read completed sales.
- `POST /api/v1/sales/:id/returns` records an idempotent itemized return and refund.
- `GET /api/v1/sales-audit/register-totals` provides the read-only interval snapshot consumed by Sales Audit.
- `GET /api/v1/audit-logs` lists persisted Retail Sales audit events.

Writes use `x-actor-id` as audit metadata in the current implementation; it is not authenticated identity. Checkout and return writes require UUID `Idempotency-Key` headers. See the [Retail Sales OpenAPI contract](../../contracts/openapi/retail-sales.yaml).

## Event flow

Completed sales and returns are persisted with outbox events and published for Warehouse Operations, Sales Audit, and Financials consumers. Consumers validate event versions and process each event idempotently. Inventory remains the source of stock authority; Financials remains the ledger authority.

## Validation

Run `pnpm --filter @mms/retail-sales typecheck` and `pnpm --filter @mms/retail-sales build` from the repository root.

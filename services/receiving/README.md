# Receiving Service

Receiving records inspected supplier deliveries as immutable goods-received notes (GRNs). It reads eligible purchase orders from Procurement and publishes accepted quantities to Inventory; it does not own purchase orders or stock totals. The service owns its PostgreSQL database and audit history.

## Local development

1. Start PostgreSQL, RabbitMQ, and dependent services with `pnpm infra:up`.
2. Copy `.env.example` to `.env` and review `DATABASE_URL`, `PROCUREMENT_API_URL`, `INVENTORY_API_URL`, and `RABBITMQ_URL`.
3. Run `pnpm --filter @mms/receiving db:migrate`.
4. Start Vendor/Inventory/Procurement dependencies as required, then run `pnpm --filter @mms/receiving dev`.

Receiving listens on port `3004`. Configure `FEATURE_RECEIVING_ENABLED` to expose its versioned API. The service validates configuration at startup.

## API routes

Business endpoints are under `/api/v1`; health checks are `/health` and `/ready`.

- `GET /api/v1/purchase-orders/open` and `GET /api/v1/purchase-orders/:id` list eligible orders and current open quantities.
- `GET /api/v1/receipts` and `GET /api/v1/receipts/:id` list and read GRNs.
- `POST /api/v1/receipts` records a delivery inspection. Supply an `Idempotency-Key` for safe retry.
- `GET /api/v1/audit-logs` reads Receiving audit events.

See the [Receiving OpenAPI contract](../../contracts/openapi/receiving.yaml). Errors use the service's controlled API error shape.

## Data and events

A GRN preserves observed, accepted, and damaged quantities, supplier delivery note, inspection notes, and actor metadata. Accepted quantities are sent to Inventory through the durable event flow; event processing is idempotent. Procurement remains authoritative for PO quantities and Financials consumes posted valuation facts through its own event workflow.

## Validation

Run `pnpm --filter @mms/receiving typecheck` and `pnpm --filter @mms/receiving build` from the repository root.

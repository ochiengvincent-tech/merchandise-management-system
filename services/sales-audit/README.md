# Sales Audit

Sales Audit owns register sessions, cashier-counted tender, reconciliation status, and manager review. Retail Sales owns sale and refund transactions; Sales Audit consumes their durable RabbitMQ events and compares its projection against Retail Sales' read-only register totals endpoint before close approval.

## Local development

1. Copy `.env.example` to `.env` and keep `FEATURE_SALES_AUDIT_ENABLED=false` until Retail Sales is emitting the required event payloads.
2. Start infrastructure with `pnpm infra:up` and apply this service's migration with `pnpm --dir services/sales-audit db:migrate`.
3. Start Retail Sales and Sales Audit in separate terminals with `pnpm --dir services/retail-sales dev` and `pnpm --dir services/sales-audit dev`.
4. Enable both backend flags and `VITE_FEATURE_RETAIL_SALES_ENABLED` plus `VITE_FEATURE_SALES_AUDIT_ENABLED` in the web app environment. Restart the services and Vite after changing flags.

Sales Audit listens on port `3007` and exposes versioned business routes below `/api/v1`. Health checks are `/health` and `/ready`. Its queue consumes `SaleCompleted` and `SaleReturned` with `payload.schemaVersion: 1`.

## Contracts

- [Sales Audit OpenAPI](../../contracts/openapi/sales-audit.yaml)
- [Retail Sales totals endpoint](../../contracts/openapi/retail-sales.yaml)
- [Sales Audit design](../../docs/phase3/sales-audit-service-design.md)

Until shared authentication is implemented, `x-actor-id` identifies the caller for audit purposes but does not enforce employee or manager authorization.

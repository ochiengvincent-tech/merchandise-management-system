# Financials service

Financials owns its PostgreSQL database and exposes ledger, reporting, period, audit, and supplier invoice APIs on port 3008. The API is mounted at `/api/v1`; the web development proxy serves it at `/api/financials`.

## Local setup

1. Start infrastructure with `pnpm infra:up` from the repository root (or start PostgreSQL on port 5441 and RabbitMQ on port 5672).
2. Copy `.env.example` to `.env`. Keep `FEATURE_FINANCIALS_ENABLED=false` and `FINANCIALS_POSTING_ENABLED=false` until finance has approved the chart and mappings.
3. Run `pnpm --filter @mms/financials db:migrate` and `pnpm --filter @mms/financials dev`.
4. Set `VITE_FEATURE_FINANCIALS_ENABLED=true` in the web environment and `FEATURE_FINANCIALS_ENABLED=true` in the service environment to show the page and start the source-event consumer.

Inventory publishes versioned `InventoryValuationChanged` events in the same transaction as receipt valuation, sale consumption, sellable return restock, and stock adjustments. The Inventory migration also emits opening valuation events for existing on-hand stock. Sale-time cost is retained for returns. If an older sale has no cost snapshot, Inventory preserves operational restocking at current average cost and marks the event with an unapproved policy; Financials records an exception instead of posting an estimate.

Retail Sales persists proportional tax allocation on each return line and includes it in the refund event. Historical events without that breakdown remain exceptions. The consumer uses durable retries and a dead-letter queue for infrastructure failures and malformed events. Posting is disabled by default; the initial chart and reports are KES-only.

The Financials page provides trial balance, income statement, inventory carrying value, posting exception retry, period close/reopen, chart account creation, validated posting mappings, journal detail and reversal, and multi-line supplier invoice capture, matching, and approval. Invoice posting requires the posting switch to be enabled and sufficient posted GRNI value for referenced receipts. Approval actor IDs are audit metadata pending shared authorization. No payment execution is provided.

The [Financials OpenAPI contract](../../contracts/openapi/financials.yaml) documents the versioned HTTP API.

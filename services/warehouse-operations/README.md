# Warehouse Operations Service

Warehouse Operations manages bins, putaway tasks, internal stock movements, adjustments, reconciliation, and warehouse audit records. Inventory remains authoritative for product/location master data and stock totals; Warehouse calls Inventory APIs and publishes stock changes through events rather than accessing its database.

## Local development

1. Start infrastructure and Inventory with `pnpm infra:up` and the relevant service commands.
2. Copy `.env.example` to `.env`; configure `DATABASE_URL`, `INVENTORY_API_URL`, and `RABBITMQ_URL`.
3. Apply schema with `pnpm --filter @mms/warehouse-operations db:migrate`.
4. Set `FEATURE_WAREHOUSE_OPERATIONS_ENABLED=true` for the service and web app when ready to use it.
5. Start with `pnpm --filter @mms/warehouse-operations dev`.

The service listens on port `3005`; health endpoints are `/health` and `/ready`; business routes are under `/api/v1`.

## API routes

- `/locations/:locationId/bins` lists and creates bins; `/bins/:binId` reads or updates a bin.
- `/putaway-tasks` and `/putaway-tasks/:taskId` list and read putaway tasks; `/putaway-tasks/:taskId/lines/:lineId/putaway` records an idempotent movement.
- `/stock`, `/movements`, and `/reconciliation` provide paginated stock, movement history, and Inventory comparison.
- `/movements` also accepts an idempotent bin-transfer request; `/locations/:locationId/adjustments` submits a reasoned stock adjustment.
- `/locations/:locationId/bootstrap` reads or initializes opening balances; `/audit-logs` lists persisted warehouse audit events.

All business routes are prefixed by `/api/v1`. See the [Warehouse Operations OpenAPI contract](../../contracts/openapi/warehouse-operations.yaml). Current actor IDs are audit metadata only. Transfers, putaway, and adjustments require UUID `Idempotency-Key` headers.

## Validation

Run `pnpm --filter @mms/warehouse-operations typecheck` and `pnpm --filter @mms/warehouse-operations build` from the repository root.

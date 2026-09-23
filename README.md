# Merchandising Management System

Phase 1 contains independently owned Vendor Management, Procurement, and
Inventory services. Each service has a private PostgreSQL database; business
events move through RabbitMQ.

## Services

- **Vendor Management** (`3001`): vendors and vendor products.
- **Procurement** (`3003`): purchase orders, approvals, amendments,
  cancellations, receipts, audit logs, and the outbox publisher.
- **Inventory** (`3002`): products, locations, stock, adjustments, and the
  purchase-order event consumer.

Each service exposes a health endpoint at `/health`. HTTP APIs are versioned
under `/api/v1`.

## Local setup

1. Start local infrastructure:

   ```bash
   pnpm infra:up
   ```

2. Copy each service's `.env.example` to `.env`. The supplied examples target
   the Compose databases and use versioned service URLs.

3. Apply each service's migrations:

   ```bash
   pnpm db:migrate
   ```

4. Start the services in separate terminals, in this order:

   ```bash
   pnpm --dir services/inventory dev
   pnpm --dir services/vendor-management dev
   pnpm --dir services/procurement dev
   ```

RabbitMQ may be unavailable when a service starts. The services remain
available for HTTP requests and reconnect to messaging in the background.

## Tests

`pnpm test` runs Inventory and Procurement tests. Inventory uses the disposable
`inventory-test-db` container on port `5436`.

Run focused checks from an individual service directory when iterating:

```bash
pnpm --dir services/inventory typecheck
pnpm --dir services/procurement typecheck
pnpm --dir services/vendor-management build
```

Procurement and Inventory use Vitest for automated tests. Vendor Management
currently has build and typecheck scripts but no test script.

After the infrastructure and all three services are running, execute the full
cross-service purchase-order flow with:

```bash
pnpm test:e2e
```

The end-to-end test creates a product, location, stock record, vendor,
vendor-product relationship, and PO; it then submits and approves the PO and
asserts that Inventory increases `quantity_on_order` once.

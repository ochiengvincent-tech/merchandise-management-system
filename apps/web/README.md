# MMS web application

The React, TypeScript, and Vite app provides the browser interface for the MMS operational services. It uses React Router for navigation, TanStack Query for server state, and the shared API client in `src/lib/api/client.ts`.

## Browser routes

| Route | Feature | Owning service(s) |
| --- | --- | --- |
| `/dashboard` | Operational overview | Vendor Management, Inventory, Procurement |
| `/products`, `/products/new`, `/products/:id`, `/products/:id/edit` | Product master | Inventory |
| `/inventory`, `/inventory/adjustments`, `/inventory/valuation` | Stock, adjustments, valuation | Inventory |
| `/locations`, `/locations/new`, `/locations/:id`, `/locations/:id/edit` | Store and warehouse locations | Inventory |
| `/vendors`, `/vendors/new`, `/vendors/:id`, `/vendors/:id/edit` | Supplier records | Vendor Management |
| `/supplier-products`, `/supplier-products/new`, `/supplier-products/:id`, `/supplier-products/:id/edit` | Supplier product relationships | Vendor Management |
| `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/:id` | Purchase orders | Procurement |
| `/approvals`, `/amendments`, `/reorder-suggestions` | Procurement review and planning | Procurement |
| `/receiving`, `/receiving/receipts/:id` | Goods receipt inspection | Receiving |
| `/warehouse-operations` | Bins, putaway, movements, and reconciliation | Warehouse Operations |
| `/retail-sales` | Register checkout and returns | Retail Sales |
| `/sales-audit` | Register close reconciliation and review | Sales Audit, Retail Sales |
| `/financials` | Ledger, reports, invoice matching, and periods | Financials |
| `/audit` | Cross-service audit history | Audit aggregation |

Feature pages may be hidden until their corresponding web feature flag is enabled. A web feature flag only controls navigation and rendering; service-side flags and authorization remain separate controls.

## API development proxy

The Vite development server proxies `/api/{service}` prefixes to local backend services and rewrites them to `/api/v1`. These routes are development-only and are not a production gateway. Configure service URLs in `src/lib/api/config.ts` for deployed environments.

| Web API prefix | Local service | Port |
| --- | --- | ---: |
| `/api/vendor` | Vendor Management | 3001 |
| `/api/inventory` | Inventory | 3002 |
| `/api/procurement` | Procurement | 3003 |
| `/api/receiving` | Receiving | 3004 |
| `/api/warehouse-operations` | Warehouse Operations | 3005 |
| `/api/retail-sales` | Retail Sales | 3006 |
| `/api/sales-audit` | Sales Audit | 3007 |
| `/api/financials` | Financials | 3008 |

## API contracts

The backend OpenAPI documents are maintained in [`contracts/openapi`](../../contracts/openapi/). The root validation command is `pnpm openapi:validate`.

| Service | Contract |
| --- | --- |
| Vendor Management | [`vendor-management.yaml`](../../contracts/openapi/vendor-management.yaml) |
| Inventory | [`inventory.yaml`](../../contracts/openapi/inventory.yaml) |
| Procurement | [`procurement.yaml`](../../contracts/openapi/procurement.yaml) |
| Receiving | [`receiving.yaml`](../../contracts/openapi/receiving.yaml) |
| Warehouse Operations | [`warehouse-operations.yaml`](../../contracts/openapi/warehouse-operations.yaml) |
| Retail Sales | [`retail-sales.yaml`](../../contracts/openapi/retail-sales.yaml) |
| Sales Audit | [`sales-audit.yaml`](../../contracts/openapi/sales-audit.yaml) |
| Financials | [`financials.yaml`](../../contracts/openapi/financials.yaml) |

## Local commands

From the repository root:

```bash
pnpm install
pnpm infra:up
pnpm --filter web dev
```

Run frontend checks with `pnpm --filter web lint` and `pnpm --filter web build`.

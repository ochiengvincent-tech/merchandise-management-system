# Inventory Service

Inventory is the authoritative service for Product Master data and inventory quantities within the Merchandising Funnel Automation (MMS) system.

## Responsibilities

The Inventory Service owns:

- Product Master
- Product lifecycle
- Inventory locations
- Stock quantities
- Reorder levels
- Stock adjustments
- Inventory audit history
- Event idempotency

The service does not own:

- Suppliers
- Supplier prices
- Supplier lead times
- Purchase orders
- Receiving records
- Retail sales
- Financial accounting

## Architecture

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Drizzle / PostgreSQL
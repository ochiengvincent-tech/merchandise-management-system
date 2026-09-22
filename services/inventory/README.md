# Inventory Service

Inventory is responsible for the Product Master, inventory locations, stock quantities, stock adjustments, stock allocation/release, inventory audit records, and inventory events.

The service owns its own PostgreSQL database and communicates with other MMS services through APIs and asynchronous events. It does not access another service's database directly.

## Responsibilities

The Inventory Service manages:

* Product Master
* Inventory locations
* Stock levels by product and location
* Available stock calculation
* Stock allocation and release
* Manual stock adjustments
* Inventory audit logs
* StockLow events
* PurchaseOrderApproved events
* PurchaseOrderCancelled events
* Durable event outbox
* RabbitMQ event publishing
* Incoming event idempotency

## Architecture

The service follows:

`Route → Controller → Service → Repository → PostgreSQL`

Asynchronous events use:

`Business operation → Outbox → RabbitMQ`

The outbox is stored in PostgreSQL so events are not lost when RabbitMQ is temporarily unavailable.

## Database

The Inventory Service uses a dedicated PostgreSQL database:

`inventory_db`

### Tables

#### `products`

The canonical Product Master.

Stores:

* SKU
* Name
* Description
* Category
* Unit of measure
* Barcode
* Status
* Reorder level
* Timestamps

Supplier information and supplier prices are not stored here.

#### `inventory_locations`

Stores inventory locations such as warehouses and stores.

Phase 1 supports:

* `WAREHOUSE`
* `STORE`

Detailed warehouse structures such as bins, racks, shelves, and zones are planned for the Warehouse Operations phase.

#### `inventory_stock`

Stores stock for a product at a specific location.

Tracks:

* `quantity_on_hand`
* `quantity_allocated`
* `quantity_on_order`

Available stock is derived:

`Available = On Hand - Allocated`

The database enforces:

`Allocated <= On Hand`

All stock quantities must be non-negative.

#### `inventory_adjustments`

Records manual changes to on-hand stock.

Every adjustment records:

* Product
* Location
* Quantity change
* Reason
* Optional reference
* Actor
* Timestamp

The stock change and adjustment record are created in the same database transaction.

#### `inventory_audit_logs`

Records important inventory actions including:

* `PRODUCT_CREATED`
* `PRODUCT_UPDATED`
* `PRODUCT_DEACTIVATED`
* `PRODUCT_REACTIVATED`
* `LOCATION_UPDATED`
* `LOCATION_DEACTIVATED`
* `LOCATION_REACTIVATED`
* `STOCK_ADJUSTED`
* `STOCK_ALLOCATED`
* `STOCK_RELEASED`
* `STOCK_LOW`
* `STOCK_ON_ORDER_INCREASED`
* `STOCK_ON_ORDER_DECREASED`

#### `inventory_processed_events`

Stores incoming event IDs that have already been processed.

This provides idempotency for RabbitMQ events.

Duplicate events are ignored using the event ID unique constraint.

#### `inventory_outbox_events`

Stores outgoing events before they are published to RabbitMQ.

States:

* `PENDING`
* `PUBLISHED`
* `FAILED`

Events are only marked `PUBLISHED` after RabbitMQ confirms the publication.

## Stock Rules

### Available stock

`Available = Quantity On Hand - Quantity Allocated`

Available stock is calculated rather than stored separately.

### Negative stock

An adjustment cannot cause on-hand stock to become negative.

### Allocation

Stock can only be allocated when sufficient available stock exists.

An allocation cannot cause:

`Allocated > On Hand`

### Release

Allocated stock cannot be released beyond the currently allocated quantity.

### Adjustments

An adjustment cannot reduce on-hand stock below the allocated quantity.

This protects the invariant:

`Allocated <= On Hand`

## StockLow Events

A `StockLow` event is generated when available stock crosses from above the reorder level to at or below the reorder level.

For example:

`Available: 21 → 19`

with:

`Reorder level: 20`

creates a `StockLow` event.

Remaining below the threshold does not repeatedly generate the same event.

If stock rises above the threshold and later crosses below it again, a new `StockLow` event can be generated.

StockLow events are first stored in the outbox and then published to RabbitMQ.

## Purchase Order Events

The Inventory Service consumes:

### `PurchaseOrderApproved`

When a purchase order is approved, the corresponding quantity is added to `quantity_on_order`.

Example:

`On Order: 0 → 10`

The operation is transactional and produces an inventory audit record.

### `PurchaseOrderCancelled`

When an approved purchase order is cancelled, the remaining ordered quantity is removed from `quantity_on_order`.

Example:

`On Order: 10 → 0`

The service prevents cancellation quantities from reducing on-order stock below zero.

Both event types use event IDs for idempotency, so resending the same event does not apply the stock change twice.

## Event Reliability

Outgoing events use the transactional outbox pattern.

Flow:

`Database transaction → PENDING outbox event → RabbitMQ → publisher confirmation → PUBLISHED`

The publisher:

* Publishes persistent messages
* Uses a durable topic exchange
* Waits for publisher confirmation
* Uses a 5-second confirmation timeout
* Retries failed publications
* Allows a maximum of 3 attempts
* Marks exhausted events as `FAILED`

If RabbitMQ is temporarily unavailable, the event remains in the PostgreSQL outbox and can be retried later.

Duplicate publication is handled by consumer-side idempotency.

RabbitMQ consumer retry and Dead Letter Queue handling will be implemented as consuming services are added to the system.

## Error Handling

Validation and business errors use the service's `AppError` structure.

Multiple independent validation errors are returned together rather than failing on the first error.

Example response:

`{ "error": { "message": "Validation failed", "details": [...] } }`

Unexpected errors return a generic `500 Internal Server Error`.

## API

Base URL during local development:

`http://localhost:3002`

### Health

`GET /health`

### Products

`POST /products`

`GET /products`

`GET /products/:id`

`PATCH /products/:id`

`PATCH /products/:id/deactivate`

`PATCH /products/:id/reactivate`

### Locations

`POST /locations`

`GET /locations`

`GET /locations/:id`

`PATCH /locations/:id`

`PATCH /locations/:id/deactivate`

`PATCH /locations/:id/reactivate`

### Stock

`POST /stock`

`GET /stock/by-product`

`GET /stock/by-location`

`GET /stock/by-product-and-location`

`POST /stock/allocate`

`POST /stock/release`

### Adjustments

`POST /adjustments`

### Events

`POST /events/purchase-order-approved`

`POST /events/purchase-order-cancelled`

## Environment Variables

The service requires:

`DATABASE_URL`

Optional:

`PORT`

Defaults to `3002`.

`RABBITMQ_URL`

Defaults to `amqp://localhost:5672`.

## Running Locally

Install dependencies from the MMS monorepo:

`pnpm install`

Run the Inventory service in development:

`pnpm --dir services/inventory dev`

Run type checking:

`pnpm --dir services/inventory typecheck`

Build the service:

`pnpm --dir services/inventory build`

## Testing

The Inventory implementation has been manually verified for:

* Product and location validation
* Positive stock adjustments
* Prevention of negative stock
* Allocation
* Available stock calculation
* Prevention of allocated stock exceeding on-hand stock
* StockLow threshold detection
* StockLow outbox creation
* PurchaseOrderApproved processing
* PurchaseOrderCancelled processing
* Duplicate event protection
* RabbitMQ publishing
* Outbox transition from `PENDING` to `PUBLISHED`

## Service Boundaries

Inventory owns its own database.

Other services must not:

* Read Inventory's PostgreSQL database
* Write directly to Inventory tables
* Create cross-service database foreign keys

Cross-service entities are referenced using UUIDs and resolved through service APIs or events.

## Current Scope

Phase 1 focuses on the foundational inventory capabilities required by Vendor Management and Procurement.

Warehouse-specific operations such as:

* Bin management
* Rack management
* Shelf management
* Putaway
* Picking
* Transfers
* Warehouse capacity

belong to the Warehouse Operations Service and are not implemented here.

## Next Integration

Procurement will use Inventory's Product Master as the canonical source for product identity.

Procurement will not access `inventory_db` directly. It will reference products by UUID and communicate with Inventory through APIs and asynchronous events.

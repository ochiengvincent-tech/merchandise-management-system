# Vendor Management Service

Vendor Management is the authoritative service for supplier information and supplier-specific product relationships within the Merchandising Funnel Automation (MMS) system.

It owns vendor identity, contact information, payment terms, supplier product relationships, supplier pricing history, lead times, and vendor-related audit records.

## Responsibilities

The Vendor Management Service owns:

* Vendor identity and business information
* Vendor codes and status
* Vendor contact information
* Vendor payment terms
* Supplier-product relationships
* Supplier product codes
* Current supplier prices
* Supplier price history
* Supplier lead times
* Vendor and supplier-product audit history

The service does not own:

* Product Master data
* Purchase orders
* Receiving records
* Inventory quantities
* Retail prices
* Sales
* Financial accounting

Product information is owned by the Inventory Service.

## Architecture

Vendor Management is an independently owned service with its own PostgreSQL database.

```text
Client
  │
  ▼
HTTP API
  │
  ▼
Controller
  │
  ▼
Service
  │
  ▼
Repository
  │
  ▼
PostgreSQL
```

The service follows a layered architecture:

* **Routes** define HTTP endpoints.
* **Controllers** handle HTTP requests and responses.
* **Validation** handles request input validation using Zod.
* **Services** contain business rules and transactional operations.
* **Repositories** handle database access.
* **Database** is accessed exclusively through the Vendor Management Service.

Vendor Management does not directly access databases owned by other services.

## Database

The service owns the `vendor_db` PostgreSQL database.

### Tables

```text
vendor_db
├── vendors
├── vendor_products
├── vendor_product_prices
└── vendor_audit_logs
```

### Vendors

The `vendors` table stores supplier identity and business information.

```text
id
vendor_code
name
email
phone
address
payment_terms
status
created_at
updated_at
```

Vendor codes are unique.

Vendor status can be:

```text
ACTIVE
INACTIVE
```

Email addresses are optional and are intentionally not required to be unique.

Payment terms are stored as an optional free-form value. Examples include:

```text
COD
NET 30
NET 60
NET 90
```

Payment terms are supplier information. When a purchase order is created, Procurement is responsible for preserving the applicable commercial terms on the PO as historical data.

### Vendor Products

The `vendor_products` table represents the relationship between a vendor and a product.

```text
id
vendor_id
product_id
supplier_product_code
current_price
lead_time_days
status
created_at
updated_at
```

The relationship is unique per vendor and product:

```text
UNIQUE(vendor_id, product_id)
```

`product_id` is a cross-service reference to the Product Master owned by Inventory.

It is not a PostgreSQL foreign key because Vendor Management and Inventory own separate databases.

A vendor-product relationship contains supplier-specific information such as:

* Supplier product code
* Current supplier price
* Currency
* Lead time
* Relationship status

Vendor Management does not become the owner of the product itself.

### Supplier Price History

Supplier price changes are stored in `vendor_product_prices`.

Each vendor-product relationship has one current price record where:

```text
effective_to IS NULL
```

When the supplier price changes:

1. The current price record is closed.
2. A new price record is created.
3. The vendor-product current price is updated.
4. The price change is audited.
5. The operations occur within the same database transaction.

This preserves the historical supplier pricing timeline while keeping the current price readily available.

## Audit Logging

Vendor Management maintains an audit trail in `vendor_audit_logs`.

Audit records contain:

```text
id
vendor_id
vendor_product_id
action
actor_id
before_state
after_state
ip_address
user_agent
signature
created_at
```

Audit records are used for consequential vendor and supplier-product operations.

Supported actions include:

```text
VENDOR_CREATED
VENDOR_UPDATED
VENDOR_DEACTIVATED
VENDOR_REACTIVATED

VENDOR_PRODUCT_ADDED
VENDOR_PRODUCT_UPDATED
VENDOR_PRODUCT_DEACTIVATED
VENDOR_PRODUCT_REACTIVATED

SUPPLIER_PRICE_CHANGED
```

Vendor updates, including payment-term changes, are recorded as:

```text
VENDOR_UPDATED
```

Audit records contain before and after state where applicable.

Audit signatures are generated using the configured audit signature secret to provide integrity protection for audit records.

## Vendor Lifecycle

Vendors are never physically deleted as part of the normal lifecycle.

A vendor can be:

```text
ACTIVE
   │
   ▼
INACTIVE
   │
   ▼
ACTIVE
```

Deactivation prevents the vendor from being treated as an active supplier while preserving historical records.

The same principle applies to vendor-product relationships.

Existing relationships and historical price records remain available for historical and audit purposes.

## Vendor Product Lifecycle

Vendor-product relationships can be:

```text
ACTIVE
INACTIVE
```

Deactivation preserves the relationship and its history rather than deleting it.

A vendor cannot have duplicate active or inactive relationships for the same product because the database enforces:

```text
UNIQUE(vendor_id, product_id)
```

Supplier price changes are treated differently from ordinary product relationship updates because they create a new historical price record.

## API

The service exposes REST endpoints.

### Health

```http
GET /health
```

Returns the service health status.

### Vendors

```http
POST /vendors
GET /vendors
GET /vendors/:id
PATCH /vendors/:id
PATCH /vendors/:id/deactivate
PATCH /vendors/:id/reactivate
```

Vendor creation and updates are validated before reaching the service layer.

Vendor search supports searching vendor codes and names.

### Vendor Products

```http
POST /vendors/:vendorId/products
GET /vendors/:vendorId/products
GET /vendors/products/:id
PATCH /vendors/products/:id
PATCH /vendors/products/:id/deactivate
PATCH /vendors/products/:id/reactivate
```

Vendor-product operations use the vendor-product association ID for updates and lifecycle operations.

The `productId` identifies the product owned by Inventory.

## Validation

Request validation is handled using Zod.

Examples of enforced rules include:

* Required vendor information must be provided.
* Vendor codes cannot be duplicated.
* Vendor-product relationships cannot be duplicated.
* Supplier prices cannot be negative.
* Lead time cannot be negative.
* Supplier product codes have a maximum length.
* Updates must contain at least one field.
* Product and vendor identifiers must be valid UUIDs where applicable.

Validation failures return a `400` response with structured error information.

## Error Handling

The service uses centralized Express error handling.

Validation errors return:

```json
{
  "error": {
    "message": "Validation failed",
    "details": []
  }
}
```

Application errors return a structured error message.

Unexpected errors return an internal server error response.

## Transactions

Database transactions are used for operations that require multiple related changes to remain consistent.

For example, a supplier price change updates:

```text
vendor_product_prices
vendor_products
vendor_audit_logs
```

as one logical operation.

If the transaction fails, the related changes are rolled back.

## Environment Variables

The service uses environment variables for configuration and audit security.

`.env.example`:

```env
SYSTEM_ACTOR_ID=
AUDIT_SIGNATURE_SECRET=
```

### SYSTEM_ACTOR_ID

UUID used when an operation is performed by the system rather than an identified user.

### AUDIT_SIGNATURE_SECRET

Secret used to generate audit record signatures.

The actual secret must not be committed to source control.

## Local Development

From the MMS monorepo:

```bash
cd services/vendor-management
```

Install dependencies from the monorepo root:

```bash
pnpm install
```

Configure the service environment using `.env`.

Run database migrations:

```bash
pnpm drizzle-kit migrate
```

Start the development server using the service's configured development script.

The Vendor Management API runs on:

```text
http://localhost:3001
```

Health check:

```http
GET http://localhost:3001/health
```

## Database Migrations

Drizzle Kit is used for database schema management.

Migration files are stored in:

```text
drizzle/
```

Schema definitions are stored under:

```text
src/db/schema/
```

Schema changes should be introduced through migrations rather than manually modifying the database.

## Testing

The service should be tested at the API and business-logic boundaries, including:

* Vendor creation
* Vendor retrieval
* Vendor updates
* Duplicate vendor codes
* Vendor validation
* Vendor deactivation
* Vendor reactivation
* Vendor-product creation
* Duplicate vendor-product relationships
* Vendor-product updates
* Supplier price changes
* Supplier price history
* Vendor-product deactivation and reactivation
* Audit records

Database constraints and service-level business rules should both be verified.

## Cross-Service Integration

Vendor Management is part of the Phase 1 MMS architecture.

Inventory owns the Product Master.

Vendor Management references Inventory products using their UUID:

```text
vendor_db.vendor_products.product_id
        │
        │ cross-service reference
        ▼
inventory_db.products.id
```

There is intentionally no database foreign key across the two databases.

When cross-service validation is required, the owning service is queried through its API rather than accessing its database directly.

## Service Boundaries

The ownership boundary is intentionally strict.

```text
Vendor Management
│
├── Supplier identity
├── Supplier contact information
├── Payment terms
├── Supplier-product relationship
├── Supplier product code
├── Supplier price
├── Supplier price history
├── Lead time
└── Vendor audit history
```

```text
Inventory
│
├── Product ID
├── SKU
├── Product name
├── Category
├── Unit of measure
├── Barcode
├── Product status
└── Reorder level
```

```text
Procurement
│
├── Purchase orders
├── PO lines
├── Ordered quantities
├── PO-specific prices
├── Approval
├── Amendments
├── Cancellation
└── Fulfillment summary
```

Keeping these boundaries prevents supplier information, product information, and purchasing information from becoming mixed into a single service.

## Current Scope

The current Vendor Management MVP provides:

* Vendor CRUD
* Vendor lifecycle management
* Payment terms
* Vendor-product relationships
* Supplier pricing
* Supplier price history
* Lead time management
* Vendor-product lifecycle management
* Audit logging
* Request validation
* Database transactions
* PostgreSQL persistence through Drizzle ORM

Future cross-service communication and event-driven integration will be added as the remaining MMS services are implemented.

## Feature Flag

The Vendor Management service is part of the Phase 1 system.

Feature flags control exposure and rollout of functionality. They do not change the underlying service ownership or distributed architecture.

## Related Services

Vendor Management participates in the broader MMS architecture alongside:

```text
Vendor Management
Procurement
Inventory
Receiving
Warehouse Operations
Retail Sales
Sales Audit
Financials
```

Each service owns its own database and communicates with other services through defined APIs and asynchronous events where appropriate.

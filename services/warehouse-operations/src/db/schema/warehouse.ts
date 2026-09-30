import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const warehouseBins = pgTable(
  "warehouse_bins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationId: uuid("location_id").notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    binType: varchar("bin_type", { length: 30 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    systemManaged: boolean("system_managed").notNull().default(false),
    zone: varchar("zone", { length: 100 }),
    aisle: varchar("aisle", { length: 50 }),
    rack: varchar("rack", { length: 50 }),
    shelf: varchar("shelf", { length: 50 }),
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("warehouse_bins_location_code_unique").on(table.locationId, table.code),
    index("warehouse_bins_location_id_idx").on(table.locationId),
    check("warehouse_bins_type_check", sql`${table.binType} IN ('RECEIVING', 'STORAGE', 'PICK_FACE', 'QUARANTINE', 'DISCREPANCY', 'UNASSIGNED')`),
    check("warehouse_bins_status_check", sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
    check("warehouse_bins_capacity_check", sql`${table.capacity} IS NULL OR ${table.capacity} >= 0`),
  ],
);

export const warehouseBinBalances = pgTable(
  "warehouse_bin_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    binId: uuid("bin_id").notNull().references(() => warehouseBins.id),
    productId: uuid("product_id").notNull(),
    disposition: varchar("disposition", { length: 20 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("warehouse_bin_balances_bin_product_disposition_unique").on(table.binId, table.productId, table.disposition),
    index("warehouse_bin_balances_product_id_idx").on(table.productId),
    check("warehouse_bin_balances_disposition_check", sql`${table.disposition} IN ('SELLABLE', 'QUARANTINED', 'DISCREPANCY')`),
    check("warehouse_bin_balances_quantity_check", sql`${table.quantity} >= 0`),
    check("warehouse_bin_balances_reserved_check", sql`${table.reservedQuantity} >= 0 AND ${table.reservedQuantity} <= ${table.quantity}`),
  ],
);

export const warehouseReceipts = pgTable(
  "warehouse_receipts",
  {
    goodsReceiptId: uuid("goods_receipt_id").primaryKey(),
    sourceEventId: uuid("source_event_id").notNull().unique(),
    grnNumber: varchar("grn_number", { length: 50 }).notNull(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    locationId: uuid("location_id").notNull(),
    receivedBy: uuid("received_by").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("warehouse_receipts_location_received_idx").on(table.locationId, table.receivedAt)],
);

export const warehouseReceiptLines = pgTable(
  "warehouse_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => warehouseReceipts.goodsReceiptId),
    lineIndex: integer("line_index").notNull(),
    purchaseOrderLineId: uuid("purchase_order_line_id"),
    productId: uuid("product_id").notNull(),
    quantityObserved: integer("quantity_observed").notNull(),
    quantityDamaged: integer("quantity_damaged").notNull(),
    quantityAccepted: integer("quantity_accepted").notNull(),
    quantityDiscrepancy: integer("quantity_discrepancy").notNull(),
  },
  (table) => [
    unique("warehouse_receipt_lines_receipt_index_unique").on(table.goodsReceiptId, table.lineIndex),
    check("warehouse_receipt_lines_quantities_non_negative", sql`${table.quantityObserved} >= 0 AND ${table.quantityDamaged} >= 0 AND ${table.quantityAccepted} >= 0 AND ${table.quantityDiscrepancy} >= 0`),
    check("warehouse_receipt_lines_damaged_observed_check", sql`${table.quantityDamaged} <= ${table.quantityObserved}`),
  ],
);

export const warehousePutawayTasks = pgTable(
  "warehouse_putaway_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goodsReceiptId: uuid("goods_receipt_id").notNull().unique().references(() => warehouseReceipts.goodsReceiptId),
    locationId: uuid("location_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("warehouse_putaway_tasks_location_status_idx").on(table.locationId, table.status),
    check("warehouse_putaway_tasks_status_check", sql`${table.status} IN ('OPEN', 'IN_PROGRESS', 'COMPLETED')`),
  ],
);

export const warehousePutawayTaskLines = pgTable(
  "warehouse_putaway_task_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull().references(() => warehousePutawayTasks.id),
    receiptLineId: uuid("receipt_line_id").notNull().references(() => warehouseReceiptLines.id),
    productId: uuid("product_id").notNull(),
    quantityAccepted: integer("quantity_accepted").notNull(),
    quantityPlaced: integer("quantity_placed").notNull().default(0),
  },
  (table) => [
    unique("warehouse_putaway_task_lines_task_receipt_line_unique").on(table.taskId, table.receiptLineId),
    check("warehouse_putaway_task_lines_quantities_check", sql`${table.quantityAccepted} > 0 AND ${table.quantityPlaced} >= 0 AND ${table.quantityPlaced} <= ${table.quantityAccepted}`),
  ],
);

export const warehouseMovements = pgTable(
  "warehouse_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    movementType: varchar("movement_type", { length: 30 }).notNull(),
    productId: uuid("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    disposition: varchar("disposition", { length: 20 }).notNull(),
    sourceBinId: uuid("source_bin_id").references(() => warehouseBins.id),
    destinationBinId: uuid("destination_bin_id").notNull().references(() => warehouseBins.id),
    locationId: uuid("location_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    referenceId: uuid("reference_id"),
    taskLineId: uuid("task_line_id").references(() => warehousePutawayTaskLines.id),
    actorId: uuid("actor_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("warehouse_movements_location_created_idx").on(table.locationId, table.createdAt),
    index("warehouse_movements_product_created_idx").on(table.productId, table.createdAt),
    check("warehouse_movements_type_check", sql`${table.movementType} IN ('OPENING_BALANCE', 'RECEIPT_INTAKE', 'PUTAWAY', 'BIN_TRANSFER', 'QUARANTINE_TRANSFER', 'INVENTORY_ADJUSTMENT')`),
    check("warehouse_movements_quantity_check", sql`${table.quantity} > 0`),
    check("warehouse_movements_disposition_check", sql`${table.disposition} IN ('SELLABLE', 'QUARANTINED', 'DISCREPANCY')`),
  ],
);

export const warehouseAdjustmentCommands = pgTable(
  "warehouse_adjustment_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    locationId: uuid("location_id").notNull(),
    productId: uuid("product_id").notNull(),
    sourceBinId: uuid("source_bin_id").notNull().references(() => warehouseBins.id),
    quantityChange: integer("quantity_change").notNull(),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    reason: varchar("reason", { length: 255 }).notNull(),
    actorId: uuid("actor_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    inventoryAdjustmentId: uuid("inventory_adjustment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("warehouse_adjustment_commands_status_idx").on(table.status),
    check("warehouse_adjustment_commands_nonzero_check", sql`${table.quantityChange} <> 0`),
    check("warehouse_adjustment_commands_reserved_check", sql`${table.reservedQuantity} >= 0`),
    check("warehouse_adjustment_commands_status_check", sql`${table.status} IN ('PENDING', 'SYNCED', 'FAILED')`),
  ],
);

export const warehouseProcessedEvents = pgTable(
  "warehouse_processed_events",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const warehouseAuditLogs = pgTable(
  "warehouse_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    actorId: uuid("actor_id").notNull(),
    locationId: uuid("location_id"),
    binId: uuid("bin_id"),
    movementId: uuid("movement_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("warehouse_audit_logs_created_idx").on(table.createdAt)],
);

export const warehouseOutboxEvents = pgTable(
  "warehouse_outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("warehouse_outbox_status_idx").on(table.status),
    check("warehouse_outbox_attempts_check", sql`${table.attempts} >= 0`),
    check("warehouse_outbox_status_check", sql`${table.status} IN ('PENDING', 'PUBLISHED', 'FAILED')`),
  ],
);


export const warehouseBootstraps = pgTable(
  "warehouse_bootstraps",
  {
    locationId: uuid("location_id").primaryKey(),
    sourceStockCount: integer("source_stock_count").notNull(),
    sourceTotalUnits: integer("source_total_units").notNull(),
    varianceCount: integer("variance_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("COMPLETED"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("warehouse_bootstraps_status_check", sql`${table.status} IN ('COMPLETED')`),
    check("warehouse_bootstraps_nonnegative_check", sql`${table.sourceStockCount} >= 0 AND ${table.sourceTotalUnits} >= 0 AND ${table.varianceCount} >= 0`),
  ],
);

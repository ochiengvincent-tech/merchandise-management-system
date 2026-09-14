import { db } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import { findStockByProductAndLocation } from "../stock/stock-repository.js";
import {
  isEventProcessed,
  markEventAsProcessed
} from "./event-service.js";
import {
  purchaseOrderApprovedEventSchema,
  purchaseOrderCancelledEventSchema
} from "./purchase-order-event-schema.js";

export const processPurchaseOrderApproved = async (
  data: unknown
) => {
  const event =
    purchaseOrderApprovedEventSchema.parse(data);

  if (await isEventProcessed(event.eventId)) {
    return {
      processed: false,
      reason: "Event already processed"
    };
  }

  return db.transaction(async (tx) => {
    for (const line of event.lines) {
      const product = await findProductById(line.productId);

      if (!product) {
        throw new Error(
          `Product not found: ${line.productId}`
        );
      }

      const location = await findLocationById(
        line.locationId
      );

      if (!location) {
        throw new Error(
          `Location not found: ${line.locationId}`
        );
      }

      const stock = await findStockByProductAndLocation(
        line.productId,
        line.locationId
      );

      if (!stock) {
        throw new Error(
          `Stock record not found for product ${line.productId} at location ${line.locationId}`
        );
      }

      const newQuantityOnOrder =
        stock.quantityOnOrder + line.quantityOrdered;

      const [updatedStock] = await tx
        .update(inventoryStock)
        .set({
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date()
        })
        .where(eq(inventoryStock.id, stock.id))
        .returning();

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      await tx.insert(inventoryAuditLogs).values({
        productId: line.productId,
        locationId: line.locationId,
        action: "STOCK_ON_ORDER_INCREASED",
        details: {
          eventId: event.eventId,
          eventType: event.eventType,
          purchaseOrderId: event.purchaseOrderId,
          quantityOrdered: line.quantityOrdered,
          previousQuantityOnOrder:
            stock.quantityOnOrder,
          newQuantityOnOrder
        }
      });
    }

    await markEventAsProcessed(
      event.eventId,
      event.eventType,
      tx
    );

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId
    };
  });
};

export const processPurchaseOrderCancelled = async (
  data: unknown
) => {
  const event =
    purchaseOrderCancelledEventSchema.parse(data);

  if (await isEventProcessed(event.eventId)) {
    return {
      processed: false,
      reason: "Event already processed"
    };
  }

  return db.transaction(async (tx) => {
    for (const line of event.lines) {
      const product = await findProductById(line.productId);

      if (!product) {
        throw new Error(
          `Product not found: ${line.productId}`
        );
      }

      const location = await findLocationById(
        line.locationId
      );

      if (!location) {
        throw new Error(
          `Location not found: ${line.locationId}`
        );
      }

      const stock = await findStockByProductAndLocation(
        line.productId,
        line.locationId
      );

      if (!stock) {
        throw new Error(
          `Stock record not found for product ${line.productId} at location ${line.locationId}`
        );
      }

      if (
        stock.quantityOnOrder <
        line.quantityRemaining
      ) {
        throw new Error(
          `Cancellation quantity exceeds on-order quantity for product ${line.productId}`
        );
      }

      const newQuantityOnOrder =
        stock.quantityOnOrder -
        line.quantityRemaining;

      const [updatedStock] = await tx
        .update(inventoryStock)
        .set({
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date()
        })
        .where(eq(inventoryStock.id, stock.id))
        .returning();

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      await tx.insert(inventoryAuditLogs).values({
        productId: line.productId,
        locationId: line.locationId,
        action: "STOCK_ON_ORDER_DECREASED",
        details: {
          eventId: event.eventId,
          eventType: event.eventType,
          purchaseOrderId: event.purchaseOrderId,
          quantityRemaining: line.quantityRemaining,
          previousQuantityOnOrder:
            stock.quantityOnOrder,
          newQuantityOnOrder
        }
      });
    }

    await markEventAsProcessed(
      event.eventId,
      event.eventType,
      tx
    );

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId
    };
  });
};
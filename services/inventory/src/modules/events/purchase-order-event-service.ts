import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryAuditLogs } from "../../db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../../db/schema/inventory-stock.js";
import { AppError } from "../../errors/app-error.js";
import { findProductByIdWithDatabase } from "../products/product-repository.js";
import { findLocationByIdWithDatabase } from "../locations/location-repository.js";
import { findStockByProductAndLocationWithDatabase } from "../stock/stock-repository.js";
import { markEventAsProcessed } from "./event-service.js";
import {
  purchaseOrderApprovedEventSchema,
  purchaseOrderCancelledEventSchema,
  purchaseOrderReceivedEventSchema,
} from "./purchase-order-event-schema.js";

export const processPurchaseOrderApproved = async (data: unknown) => {
  const event = purchaseOrderApprovedEventSchema.parse(data);

  return db.transaction(async (tx) => {
    const processedEvent = await markEventAsProcessed(
      event.eventId,
      event.eventType,
      tx,
    );

    if (!processedEvent) {
      return {
        processed: false,
        reason: "Event already processed",
      };
    }

    const lineData = await Promise.all(
      event.lines.map(async (line) => {
        const [product, location, stock] = await Promise.all([
          findProductByIdWithDatabase(line.productId, tx),
          findLocationByIdWithDatabase(line.locationId, tx),
          findStockByProductAndLocationWithDatabase(
            line.productId,
            line.locationId,
            tx,
          ),
        ]);

        return {
          line,
          product,
          location,
          stock,
        };
      }),
    );

    const errors = [];

    for (const { line, product, location, stock } of lineData) {
      if (!product) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.productId`,
          message: `Product not found: ${line.productId}`,
        });
      }

      if (!location) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.locationId`,
          message: `Location not found: ${line.locationId}`,
        });
      }

      if (!stock) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}`,
          message: `Stock record not found for product ${line.productId} at location ${line.locationId}`,
        });
      }
    }

    if (errors.length > 0) {
      throw new AppError("Validation failed", 400, errors);
    }

    for (const { line, stock } of lineData) {
      if (!stock) {
        throw new Error("Validation failed");
      }

      const newQuantityOnOrder = stock.quantityOnOrder + line.quantityOrdered;

      const [updatedStock] = await tx
        .update(inventoryStock)
        .set({
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date(),
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
          previousQuantityOnOrder: stock.quantityOnOrder,
          newQuantityOnOrder,
        },
      });
    }

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId,
    };
  });
};

export const processPurchaseOrderCancelled = async (data: unknown) => {
  const event = purchaseOrderCancelledEventSchema.parse(data);

  return db.transaction(async (tx) => {
    const processedEvent = await markEventAsProcessed(
      event.eventId,
      event.eventType,
      tx,
    );

    if (!processedEvent) {
      return {
        processed: false,
        reason: "Event already processed",
      };
    }

    const lineData = await Promise.all(
      event.lines.map(async (line) => {
        const [product, location, stock] = await Promise.all([
          findProductByIdWithDatabase(line.productId, tx),
          findLocationByIdWithDatabase(line.locationId, tx),
          findStockByProductAndLocationWithDatabase(
            line.productId,
            line.locationId,
            tx,
          ),
        ]);

        return {
          line,
          product,
          location,
          stock,
        };
      }),
    );

    const errors = [];

    for (const { line, product, location, stock } of lineData) {
      if (!product) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.productId`,
          message: `Product not found: ${line.productId}`,
        });
      }

      if (!location) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.locationId`,
          message: `Location not found: ${line.locationId}`,
        });
      }

      if (!stock) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}`,
          message: `Stock record not found for product ${line.productId} at location ${line.locationId}`,
        });
      }
    }

    for (const { line, stock } of lineData) {
      if (stock && stock.quantityOnOrder < line.quantityRemaining) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.quantityRemaining`,
          message: `Cancellation quantity exceeds on-order quantity for product ${line.productId}`,
        });
      }
    }

    if (errors.length > 0) {
      throw new AppError("Validation failed", 400, errors);
    }

    for (const { line, stock } of lineData) {
      if (!stock) {
        throw new Error("Validation failed");
      }

      const newQuantityOnOrder = stock.quantityOnOrder - line.quantityRemaining;

      const [updatedStock] = await tx
        .update(inventoryStock)
        .set({
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date(),
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
          previousQuantityOnOrder: stock.quantityOnOrder,
          newQuantityOnOrder,
        },
      });
    }

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId,
    };
  });
};

export const processPurchaseOrderReceived = async (data: unknown) => {
  const event = purchaseOrderReceivedEventSchema.parse(data);

  return db.transaction(async (tx) => {
    const processedEvent = await markEventAsProcessed(
      event.eventId,
      event.eventType,
      tx,
    );

    if (!processedEvent) {
      return {
        processed: false,
        reason: "Event already processed",
      };
    }

    const lineData = await Promise.all(
      event.lines.map(async (line) => {
        const [product, location, stock] = await Promise.all([
          findProductByIdWithDatabase(line.productId, tx),
          findLocationByIdWithDatabase(line.locationId, tx),
          findStockByProductAndLocationWithDatabase(
            line.productId,
            line.locationId,
            tx,
          ),
        ]);

        return {
          line,
          product,
          location,
          stock,
        };
      }),
    );

    const errors = [];

    for (const { line, product, location, stock } of lineData) {
      if (!product) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.productId`,
          message: `Product not found: ${line.productId}`,
        });
      }

      if (!location) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.locationId`,
          message: `Location not found: ${line.locationId}`,
        });
      }

      if (!stock) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}`,
          message: `Stock record not found for product ${line.productId} at location ${line.locationId}`,
        });
      }

      if (stock && stock.quantityOnOrder < line.quantityReceived) {
        errors.push({
          field: `lines.${event.lines.indexOf(line)}.quantityReceived`,
          message: `Received quantity exceeds on-order quantity for product ${line.productId}`,
        });
      }
    }

    if (errors.length > 0) {
      throw new AppError("Validation failed", 400, errors);
    }

    for (const { line, stock } of lineData) {
      if (!stock) {
        throw new Error("Validation failed");
      }

      const newQuantityOnOrder = stock.quantityOnOrder - line.quantityReceived;

      const newQuantityOnHand = stock.quantityOnHand + line.quantityReceived;

      const oldUnitCost = Number(stock.unitCost);
      const receivedUnitPrice = line.unitPrice;

      const newUnitCost =
        newQuantityOnHand === 0
          ? receivedUnitPrice
          : Number(
              (
                (stock.quantityOnHand * oldUnitCost +
                  line.quantityReceived * receivedUnitPrice) /
                newQuantityOnHand
              ).toFixed(2),
            );

      const [updatedStock] = await tx
        .update(inventoryStock)
        .set({
          quantityOnOrder: newQuantityOnOrder,
          quantityOnHand: newQuantityOnHand,
          unitCost: newUnitCost.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(inventoryStock.id, stock.id))
        .returning();

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      await tx.insert(inventoryAuditLogs).values({
        productId: line.productId,
        locationId: line.locationId,
        action: "STOCK_RECEIVED",
        details: {
          eventId: event.eventId,
          eventType: event.eventType,
          purchaseOrderId: event.purchaseOrderId,
          quantityReceived: line.quantityReceived,
          receivedUnitPrice,
          previousQuantityOnOrder: stock.quantityOnOrder,
          newQuantityOnOrder,
          previousQuantityOnHand: stock.quantityOnHand,
          newQuantityOnHand,
          previousUnitCost: stock.unitCost,
          newUnitCost: newUnitCost.toFixed(2),
        },
      });
    }

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId,
    };
  });
};

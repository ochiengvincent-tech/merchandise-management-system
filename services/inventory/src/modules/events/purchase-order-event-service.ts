import { AppError } from "../../errors/app-error.js";
import { findProductByIdWithDatabase } from "../products/product-repository.js";
import { findLocationByIdWithDatabase } from "../locations/location-repository.js";
import { findStockByProductAndLocationWithDatabase } from "../stock/stock-repository.js";
import { markEventAsProcessed } from "./event-service.js";
import { runInventoryTransaction } from "./event-repository.js";
import { createInventoryAuditLogService } from "../audit/audit-service.js";
import {
  findStockForUpdate,
  updateStockById,
} from "../stock/stock-repository.js";
import { moneyToMinor, unitCostFromCarryingValue } from "./valuation-outbox.js";
import { recordValuationChange } from "./valuation-repository.js";
import {
  purchaseOrderApprovedEventSchema,
  purchaseOrderCancelledEventSchema,
  purchaseOrderReceivedEventSchema,
  goodsReceivedEventSchema,
} from "./purchase-order-event-schema.js";

export const processPurchaseOrderApproved = async (data: unknown) => {
  const event = purchaseOrderApprovedEventSchema.parse(data);

  return runInventoryTransaction(async (tx) => {
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

      const [updatedStock] = await updateStockById(
        stock.id,
        {
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date(),
        },
        tx,
      );

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      await createInventoryAuditLogService(
        {
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
        },
        tx,
      );
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

  return runInventoryTransaction(async (tx) => {
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

      const [updatedStock] = await updateStockById(
        stock.id,
        {
          quantityOnOrder: newQuantityOnOrder,
          updatedAt: new Date(),
        },
        tx,
      );

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      await createInventoryAuditLogService(
        {
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
        },
        tx,
      );
    }

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId,
    };
  });
};

export const processPurchaseOrderReceived = async (data: unknown) => {
  const event: {
    eventId: string;
    eventType: "PurchaseOrderReceived" | "GoodsReceived";
    purchaseOrderId: string;
    lines: Array<{
      productId: string;
      locationId: string;
      quantityReceived: number;
      unitPrice: number;
    }>;
    goodsReceipt?: { id: string; currency: string; sourceEventId: string };
  } =
    typeof data === "object" &&
    data !== null &&
    "eventType" in data &&
    data.eventType === "GoodsReceived"
      ? (() => {
          const received = goodsReceivedEventSchema.parse(data);
          return {
            eventId: received.eventId,
            eventType: received.eventType,
            purchaseOrderId: received.purchaseOrderId,
            goodsReceipt: {
              id: received.goodsReceiptId,
              currency: received.currency,
              sourceEventId: received.eventId,
            },
            lines: received.lines
              .filter((line) => line.quantityAccepted > 0)
              .map((line) => ({
                productId: line.productId,
                locationId: received.destinationLocationId,
                quantityReceived: line.quantityAccepted,
                unitPrice: line.unitPrice,
              })),
          };
        })()
      : purchaseOrderReceivedEventSchema.parse(data);

  return runInventoryTransaction(async (tx) => {
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

    for (const { line, stock: originalStock } of lineData) {
      const [stockRow] = await findStockForUpdate(originalStock?.id ?? "", tx);
      if (!stockRow || stockRow.quantityOnOrder < line.quantityReceived)
        throw new AppError(
          "Accepted receipt quantity exceeds current on-order stock",
          409,
        );
      const newQuantityOnOrder =
        stockRow.quantityOnOrder - line.quantityReceived;

      const newQuantityOnHand = stockRow.quantityOnHand + line.quantityReceived;

      const receivedUnitPrice = line.unitPrice;
      const receivedValueMinor =
        BigInt(line.quantityReceived) * moneyToMinor(receivedUnitPrice);
      const newCarryingValueMinor =
        BigInt(stockRow.carryingValueMinor) + receivedValueMinor;
      const newUnitCost = unitCostFromCarryingValue(
        newCarryingValueMinor,
        newQuantityOnHand,
      );

      const [updatedStock] = await updateStockById(
        stockRow.id,
        {
          quantityOnOrder: newQuantityOnOrder,
          quantityOnHand: newQuantityOnHand,
          carryingValueMinor: newCarryingValueMinor.toString(),
          unitCost: newUnitCost,
          updatedAt: new Date(),
        },
        tx,
      );

      if (!updatedStock) {
        throw new Error("Failed to update stock");
      }

      if (event.goodsReceipt) {
        await recordValuationChange(tx, {
          stockId: stockRow.id,
          sourceType: "RECEIPT",
          sourceId: event.goodsReceipt.id,
          sourceEventId: event.goodsReceipt.sourceEventId,
          productId: line.productId,
          locationId: line.locationId,
          quantityDelta: line.quantityReceived,
          carryingValueDeltaMinor: receivedValueMinor,
          reason: "RECEIPT",
          currency: event.goodsReceipt.currency,
        });
      }

      await createInventoryAuditLogService(
        {
          productId: line.productId,
          locationId: line.locationId,
          action: "STOCK_RECEIVED",
          details: {
            eventId: event.eventId,
            eventType: event.eventType,
            purchaseOrderId: event.purchaseOrderId,
            quantityReceived: line.quantityReceived,
            receivedUnitPrice,
            previousQuantityOnOrder: stockRow.quantityOnOrder,
            newQuantityOnOrder,
            previousQuantityOnHand: stockRow.quantityOnHand,
            newQuantityOnHand,
            previousUnitCost: stockRow.unitCost,
            newUnitCost,
          },
        },
        tx,
      );
    }

    return {
      processed: true,
      eventId: event.eventId,
      purchaseOrderId: event.purchaseOrderId,
    };
  });
};

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../src/db/index.js";
import { inventoryAuditLogs } from "../src/db/schema/inventory-audit-logs.js";
import { inventoryStock } from "../src/db/schema/inventory-stock.js";
import { processPurchaseOrderReceived } from "../src/modules/events/purchase-order-event-service.js";
import {
  createLocation,
  createProduct,
  createStock,
  setStockQuantity,
} from "./helpers.js";

describe("PurchaseOrderReceived event", () => {
  it("calculates weighted average unit cost when receiving into existing stock", async () => {
    const product = await createProduct();
    const location = await createLocation();
    const stock = await createStock(product.id, location.id);

    await setStockQuantity(product.id, location.id, 100);

    await db
      .update(inventoryStock)
      .set({
        quantityOnOrder: 50,
        unitCost: "50.00",
      })
      .where(eq(inventoryStock.id, stock.id));

    const eventId = randomUUID();
    const purchaseOrderId = randomUUID();

    const result = await processPurchaseOrderReceived({
      eventId,
      eventType: "PurchaseOrderReceived",
      purchaseOrderId,
      lines: [
        {
          productId: product.id,
          locationId: location.id,
          quantityReceived: 50,
          unitPrice: 60,
        },
      ],
    });

    expect(result.processed).toBe(true);

    const [updatedStock] = await db
      .select()
      .from(inventoryStock)
      .where(eq(inventoryStock.id, stock.id));

    expect(updatedStock).toMatchObject({
      quantityOnHand: 150,
      quantityOnOrder: 0,
      unitCost: "53.33",
    });
  });

  it("does not process the same receipt event twice", async () => {
    const product = await createProduct();
    const location = await createLocation();
    const stock = await createStock(product.id, location.id);

    await db
      .update(inventoryStock)
      .set({
        quantityOnOrder: 50,
      })
      .where(eq(inventoryStock.id, stock.id));

    const eventId = randomUUID();
    const purchaseOrderId = randomUUID();

    const event = {
      eventId,
      eventType: "PurchaseOrderReceived" as const,
      purchaseOrderId,
      lines: [
        {
          productId: product.id,
          locationId: location.id,
          quantityReceived: 50,
          unitPrice: 60,
        },
      ],
    };

    const firstResult = await processPurchaseOrderReceived(event);
    const secondResult = await processPurchaseOrderReceived(event);

    expect(firstResult.processed).toBe(true);
    expect(secondResult).toEqual({
      processed: false,
      reason: "Event already processed",
    });

    const [updatedStock] = await db
      .select()
      .from(inventoryStock)
      .where(eq(inventoryStock.id, stock.id));

    expect(updatedStock).toMatchObject({
      quantityOnHand: 50,
      quantityOnOrder: 0,
      unitCost: "60.00",
    });
  });
});

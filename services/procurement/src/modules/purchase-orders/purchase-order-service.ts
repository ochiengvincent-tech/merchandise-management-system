import { db } from "../../db/index.js";

import { AppError } from "../../errors/app-error.js";

import {
  createPurchaseOrderWithDatabase,
  findPurchaseOrderById,
  findPurchaseOrderByNumber,
  listPurchaseOrders as listPurchaseOrdersFromDatabase,
} from "./purchase-order-repository.js";

import {
  createPurchaseOrderLinesWithDatabase,
  findPurchaseOrderLines,
} from "./purchase-order-line-repository.js";

import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import { centsToMoney, moneyToCents } from "./money.js";
import { findPurchaseOrderCancellation } from "../cancellations/purchase-order-cancellation-repository.js";

import {
  getVendorById,
  getVendorProducts,
  VendorServiceError,
} from "../../clients/vendor-client.js";

import {
  getLocationById,
  getProductById,
  InventoryServiceError,
} from "../../clients/inventory-client.js";

type PurchaseOrderLineInput = {
  productId: string;
  quantityOrdered: number;
};

type CreatePurchaseOrderInput = {
  poNumber: string;
  vendorId: string;
  destinationLocationId: string;
  requestedDeliveryDate?: string | null;
  currency?: string;
  lines: PurchaseOrderLineInput[];
  notes?: string;
  createdBy: string;
};

type ListPurchaseOrdersInput = {
  offset: number;
  limit: number;
  status?: string;
  search?: string;
};

export function assertRequestedDeliveryDateIsNotBeforeCreation(
  requestedDeliveryDate: string | null | undefined,
  createdAt = new Date(),
) {
  if (!requestedDeliveryDate) {
    return;
  }

  const creationDate = createdAt.toISOString().slice(0, 10);
  if (requestedDeliveryDate < creationDate) {
    throw new AppError(
      "Requested delivery date cannot be before the purchase-order creation date",
      400,
      [
        {
          field: "requestedDeliveryDate",
          message: "Choose the creation date or a later date.",
        },
      ],
    );
  }
}

export async function createPurchaseOrder(data: CreatePurchaseOrderInput) {
  assertRequestedDeliveryDateIsNotBeforeCreation(data.requestedDeliveryDate);

  if (data.lines.length === 0) {
    throw new AppError("Purchase order must contain at least one line", 400);
  }

  const productIds = new Set<string>();

  data.lines.forEach((line, index) => {
    if (productIds.has(line.productId)) {
      throw new AppError(
        `Product ${line.productId} cannot appear more than once in a purchase order`,
        400,
        [
          {
            field: `lines.${index}.productId`,
            message: "A product can only appear once in an order.",
          },
        ],
      );
    }

    productIds.add(line.productId);

    if (!Number.isInteger(line.quantityOrdered) || line.quantityOrdered <= 0) {
      throw new AppError("Ordered quantity must be a positive integer", 400, [
        {
          field: `lines.${index}.quantityOrdered`,
          message: "Enter a positive whole-number quantity.",
        },
      ]);
    }
  });

  const existingPurchaseOrder = await findPurchaseOrderByNumber(data.poNumber);

  if (existingPurchaseOrder) {
    throw new AppError("Purchase order number already exists", 409, [
      {
        field: "poNumber",
        message: "This PO number is already in use.",
      },
    ]);
  }

  let location;

  try {
    location = await getLocationById(data.destinationLocationId);
  } catch (error) {
    if (error instanceof InventoryServiceError && error.status === 404) {
      throw new AppError("Destination location not found", 404);
    }

    throw new AppError("Inventory service is unavailable", 503);
  }

  if (location.status !== "ACTIVE") {
    throw new AppError("Destination location is inactive", 409);
  }

  let vendor;

  try {
    vendor = await getVendorById(data.vendorId);
  } catch (error) {
    if (error instanceof VendorServiceError && error.status === 404) {
      throw new AppError("Vendor not found", 404);
    }

    throw new AppError("Vendor service is unavailable", 503);
  }

  if (vendor.status !== "ACTIVE") {
    throw new AppError("Vendor is inactive", 409);
  }

  if (!vendor.paymentTerms) {
    throw new AppError("Vendor payment terms are not configured", 409);
  }

  const paymentTerms = vendor.paymentTerms;

  let vendorProducts;

  try {
    vendorProducts = await getVendorProducts(data.vendorId);
  } catch {
    throw new AppError("Vendor service is unavailable", 503);
  }

  const vendorProductsByProductId = new Map(
    vendorProducts.map((vendorProduct) => [
      vendorProduct.productId,
      vendorProduct,
    ]),
  );

  const authoritativeLines = data.lines.map((line) => {
    const vendorProduct = vendorProductsByProductId.get(line.productId);

    if (!vendorProduct) {
      throw new AppError(
        `Vendor does not supply product ${line.productId}`,
        409,
      );
    }

    if (vendorProduct.status !== "ACTIVE") {
      throw new AppError(`Vendor product ${line.productId} is inactive`, 409);
    }

    return {
      productId: line.productId,
      quantityOrdered: line.quantityOrdered,
      unitPrice: vendorProduct.currentPrice,
    };
  });

  await Promise.all(
    authoritativeLines.map(async (line) => {
      try {
        const product = await getProductById(line.productId);

        if (product.status !== "ACTIVE") {
          throw new AppError(`Product ${line.productId} is inactive`, 409);
        }
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        if (error instanceof InventoryServiceError && error.status === 404) {
          throw new AppError("Product not found", 404);
        }

        throw new AppError("Inventory service is unavailable", 503);
      }
    }),
  );

  const lineTotals = authoritativeLines.map((line) => {
    const unitPriceCents = moneyToCents(line.unitPrice);
    const lineTotalCents = BigInt(line.quantityOrdered) * unitPriceCents;

    return {
      ...line,
      lineTotal: centsToMoney(lineTotalCents),
      lineTotalCents,
    };
  });

  const subtotalCents = lineTotals.reduce(
    (total, line) => total + line.lineTotalCents,
    0n,
  );

  const subtotal = centsToMoney(subtotalCents);

  return db.transaction(async (tx) => {
    const purchaseOrder = await createPurchaseOrderWithDatabase(
      {
        poNumber: data.poNumber,
        vendorId: data.vendorId,
        destinationLocationId: data.destinationLocationId,
        requestedDeliveryDate: data.requestedDeliveryDate ?? null,
        status: "DRAFT",
        currency: data.currency ?? "KES",
        paymentTerms,
        subtotal,
        totalAmount: subtotal,
        notes: data.notes,
        createdBy: data.createdBy,
      },
      tx,
    );

    if (!purchaseOrder) {
      throw new Error("Failed to create purchase order");
    }

    const createdLines = await createPurchaseOrderLinesWithDatabase(
      lineTotals.map((line) => ({
        purchaseOrderId: purchaseOrder.id,
        productId: line.productId,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: 0,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
      tx,
    );

    if (createdLines.length !== authoritativeLines.length) {
      throw new Error("Failed to create purchase order lines");
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId: purchaseOrder.id,
        action: "PO_CREATED",
        actorId: data.createdBy,
        beforeState: null,
        afterState: {
          ...purchaseOrder,
          lines: createdLines,
        },
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order audit");
    }

    return {
      purchaseOrder,
      lines: createdLines,
    };
  });
}

export async function getPurchaseOrder(id: string) {
  const purchaseOrder = await findPurchaseOrderById(id);

  if (!purchaseOrder) {
    throw new AppError("Purchase order not found", 404);
  }

  const lines = await findPurchaseOrderLines(id);
  const cancellation = await findPurchaseOrderCancellation(id);

  return {
    ...purchaseOrder,
    lines,
    cancellation,
  };
}

export async function listPurchaseOrders(data: ListPurchaseOrdersInput) {
  return listPurchaseOrdersFromDatabase(data);
}

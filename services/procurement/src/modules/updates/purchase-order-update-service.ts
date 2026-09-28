import { db } from "../../db/index.js";
import { AppError } from "../../errors/app-error.js";
import {
  getLocationById,
  getProductById,
  InventoryServiceError,
} from "../../clients/inventory-client.js";
import {
  getVendorById,
  getVendorProducts,
  VendorServiceError,
} from "../../clients/vendor-client.js";
import {
  findPurchaseOrderById,
  findPurchaseOrderByNumber,
  updatePurchaseOrderWithDatabase,
} from "../purchase-orders/purchase-order-repository.js";
import {
  createPurchaseOrderLinesWithDatabase,
  deletePurchaseOrderLinesWithDatabase,
  findPurchaseOrderLines,
} from "../purchase-orders/purchase-order-line-repository.js";
import { createApprovalAuditLogWithDatabase } from "../approvals/approval-audit-repository.js";
import {
  assertRequestedDeliveryDateIsNotBeforeCreation,
} from "../purchase-orders/purchase-order-service.js";
import { centsToMoney, moneyToCents } from "../purchase-orders/money.js";

export type UpdatePurchaseOrderInput = {
  poNumber?: string;
  vendorId?: string;
  destinationLocationId?: string;
  requestedDeliveryDate?: string | null;
  notes?: string | null;
  lines?: Array<{
    productId: string;
    quantityOrdered: number;
  }>;
};

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  data: UpdatePurchaseOrderInput,
  actorId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId);

  if (!purchaseOrder) {
    return null;
  }

  if (purchaseOrder.status !== "DRAFT") {
    throw new AppError("Only draft purchase orders can be updated", 409);
  }

  const currentLines = await findPurchaseOrderLines(purchaseOrderId);
  const targetVendorId = data.vendorId ?? purchaseOrder.vendorId;
  const vendorChanged = targetVendorId !== purchaseOrder.vendorId;
  const poNumberChanged =
    data.poNumber !== undefined && data.poNumber !== purchaseOrder.poNumber;
  const destinationChanged =
    data.destinationLocationId !== undefined &&
    data.destinationLocationId !== purchaseOrder.destinationLocationId;
  const deliveryDateChanged =
    data.requestedDeliveryDate !== undefined &&
    data.requestedDeliveryDate !== purchaseOrder.requestedDeliveryDate;
  const notesChanged =
    data.notes !== undefined && data.notes !== purchaseOrder.notes;

  if (vendorChanged && data.lines === undefined) {
    throw new AppError("Changing the vendor requires updated order lines", 400, [
      {
        field: "lines",
        message: "Review the products and quantities for the new vendor.",
      },
    ]);
  }

  const existingPurchaseOrder = poNumberChanged
    ? await findPurchaseOrderByNumber(data.poNumber!)
    : null;
  if (existingPurchaseOrder && existingPurchaseOrder.id !== purchaseOrderId) {
    throw new AppError("Purchase order number already exists", 409, [
      {
        field: "poNumber",
        message: "This PO number is already in use.",
      },
    ]);
  }

  if (destinationChanged) {
    let location;
    try {
      location = await getLocationById(data.destinationLocationId!);
    } catch (error) {
      if (error instanceof InventoryServiceError && error.status === 404) {
        throw new AppError("Destination location not found", 404, [
          { field: "destinationLocationId", message: "Choose an active destination." },
        ]);
      }
      throw new AppError("Inventory service is unavailable", 503);
    }

    if (location.status !== "ACTIVE") {
      throw new AppError("Destination location is inactive", 409, [
        { field: "destinationLocationId", message: "Choose an active destination." },
      ]);
    }
  }

  if (data.requestedDeliveryDate !== undefined) {
    assertRequestedDeliveryDateIsNotBeforeCreation(
      data.requestedDeliveryDate,
      new Date(purchaseOrder.createdAt),
    );
  }

  const currentLineByProductId = new Map(
    currentLines.map((line) => [line.productId, line]),
  );
  const linesChanged =
    data.lines !== undefined &&
    (vendorChanged ||
      data.lines.length !== currentLines.length ||
      data.lines.some((line, index) => {
        const current = currentLines[index];
        return (
          !current ||
          current.productId !== line.productId ||
          current.quantityOrdered !== line.quantityOrdered
        );
      }));

  let nextPaymentTerms: string | undefined;
  let nextLines: Array<{
    productId: string;
    quantityOrdered: number;
    unitPrice: string;
    lineTotal: string;
    lineTotalCents: bigint;
  }> | undefined;

  if (data.lines !== undefined) {
    if (data.lines.length === 0) {
      throw new AppError("Purchase order must contain at least one line", 400, [
        { field: "lines", message: "Add at least one order line." },
      ]);
    }

    const seenProducts = new Set<string>();
    data.lines.forEach((line, index) => {
      if (seenProducts.has(line.productId)) {
        throw new AppError("A product cannot appear more than once in an order", 400, [
          {
            field: `lines.${index}.productId`,
            message: "A product can only appear once in an order.",
          },
        ]);
      }
      seenProducts.add(line.productId);

      if (!Number.isInteger(line.quantityOrdered) || line.quantityOrdered <= 0) {
        throw new AppError("Ordered quantity must be a positive integer", 400, [
          {
            field: `lines.${index}.quantityOrdered`,
            message: "Enter a positive whole-number quantity.",
          },
        ]);
      }
    });

    const freshProductsNeeded = vendorChanged || data.lines.some(
      (line) => !currentLineByProductId.has(line.productId),
    );

    let vendorProductsByProductId = new Map<
      string,
      Awaited<ReturnType<typeof getVendorProducts>>[number]
    >();

    if (freshProductsNeeded) {
      let vendor;
      try {
        vendor = await getVendorById(targetVendorId);
      } catch (error) {
        if (error instanceof VendorServiceError && error.status === 404) {
          throw new AppError("Vendor not found", 404, [
            { field: "vendorId", message: "Choose an active vendor." },
          ]);
        }
        throw new AppError("Vendor service is unavailable", 503);
      }

      if (vendor.status !== "ACTIVE") {
        throw new AppError("Vendor is inactive", 409, [
          { field: "vendorId", message: "Choose an active vendor." },
        ]);
      }

      if (!vendor.paymentTerms) {
        throw new AppError("Vendor payment terms are not configured", 409, [
          { field: "vendorId", message: "This vendor has no payment terms configured." },
        ]);
      }
      nextPaymentTerms = vendor.paymentTerms;

      let vendorProducts;
      try {
        vendorProducts = await getVendorProducts(targetVendorId);
      } catch {
        throw new AppError("Vendor service is unavailable", 503);
      }
      vendorProductsByProductId = new Map(
        vendorProducts.map((vendorProduct) => [vendorProduct.productId, vendorProduct]),
      );
    }

    nextLines = await Promise.all(
      data.lines.map(async (line, index) => {
        const currentLine = vendorChanged
          ? undefined
          : currentLineByProductId.get(line.productId);
        let unitPrice = currentLine?.unitPrice;

        if (!unitPrice) {
          const vendorProduct = vendorProductsByProductId.get(line.productId);
          if (!vendorProduct) {
            throw new AppError("Vendor does not supply this product", 409, [
              {
                field: `lines.${index}.productId`,
                message: "Choose a product supplied by the selected vendor.",
              },
            ]);
          }
          if (vendorProduct.status !== "ACTIVE") {
            throw new AppError("Vendor product is inactive", 409, [
              {
                field: `lines.${index}.productId`,
                message: "Choose an active supplier product.",
              },
            ]);
          }

          try {
            const product = await getProductById(line.productId);
            if (product.status !== "ACTIVE") {
              throw new AppError("Product is inactive", 409, [
                {
                  field: `lines.${index}.productId`,
                  message: "Choose an active product.",
                },
              ]);
            }
          } catch (error) {
            if (error instanceof AppError) throw error;
            if (error instanceof InventoryServiceError && error.status === 404) {
              throw new AppError("Product not found", 404, [
                { field: `lines.${index}.productId`, message: "Choose an active product." },
              ]);
            }
            throw new AppError("Inventory service is unavailable", 503);
          }

          unitPrice = vendorProduct.currentPrice;
        }

        const lineTotalCents =
          BigInt(line.quantityOrdered) * moneyToCents(unitPrice);
        return {
          productId: line.productId,
          quantityOrdered: line.quantityOrdered,
          unitPrice,
          lineTotal: centsToMoney(lineTotalCents),
          lineTotalCents,
        };
      }),
    );
  }

  const hasChanges =
    poNumberChanged ||
    vendorChanged ||
    destinationChanged ||
    deliveryDateChanged ||
    notesChanged ||
    linesChanged;
  if (!hasChanges) {
    throw new AppError("Change at least one purchase-order field before saving", 400);
  }

  const subtotalCents = nextLines?.reduce(
    (total, line) => total + line.lineTotalCents,
    0n,
  );

  return db.transaction(async (tx) => {
    const updatedPurchaseOrder = await updatePurchaseOrderWithDatabase(
      purchaseOrderId,
      {
        ...(poNumberChanged && { poNumber: data.poNumber }),
        ...(vendorChanged && { vendorId: targetVendorId }),
        ...(destinationChanged && {
          destinationLocationId: data.destinationLocationId,
        }),
        ...(deliveryDateChanged && {
          requestedDeliveryDate: data.requestedDeliveryDate,
        }),
        ...(notesChanged && { notes: data.notes }),
        ...(vendorChanged && nextPaymentTerms && { paymentTerms: nextPaymentTerms }),
        ...(subtotalCents !== undefined && {
          subtotal: centsToMoney(subtotalCents),
          totalAmount: centsToMoney(subtotalCents),
        }),
        ...(purchaseOrder.revisionRequired && { revisionRequired: false }),
      },
      tx,
    );

    if (!updatedPurchaseOrder) {
      throw new Error("Failed to update purchase order");
    }

    let updatedLines = currentLines;
    if (linesChanged && nextLines) {
      await deletePurchaseOrderLinesWithDatabase(purchaseOrderId, tx);
      updatedLines = await createPurchaseOrderLinesWithDatabase(
        nextLines.map((line) => ({
          purchaseOrderId,
          productId: line.productId,
          quantityOrdered: line.quantityOrdered,
          quantityReceived: 0,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
        tx,
      );
      if (updatedLines.length !== nextLines.length) {
        throw new Error("Failed to update purchase-order lines");
      }
    }

    const auditLog = await createApprovalAuditLogWithDatabase(
      {
        purchaseOrderId,
        action: "PO_UPDATED",
        actorId,
        beforeState: { ...purchaseOrder, lines: currentLines },
        afterState: { ...updatedPurchaseOrder, lines: updatedLines },
      },
      tx,
    );

    if (!auditLog) {
      throw new Error("Failed to create purchase order update audit");
    }

    return updatedPurchaseOrder;
  });
}

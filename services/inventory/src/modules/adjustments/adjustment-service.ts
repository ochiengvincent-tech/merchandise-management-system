import { AppError } from "../../errors/app-error.js";
import { findProductById } from "../products/product-repository.js";
import { findLocationById } from "../locations/location-repository.js";
import { findStockByProductAndLocation } from "../stock/stock-repository.js";
import { createAdjustmentTransaction } from "./adjustment-repository.js";
import { createStockLowEvent } from "../events/stock-low-event-service.js";

export const createAdjustmentService = async (data: {
  productId: string;
  locationId: string;
  quantityChange: number;
  reason: string;
  reference?: string;
  createdBy: string;
}) => {
  const [product, location] = await Promise.all([
    findProductById(data.productId),
    findLocationById(data.locationId),
  ]);

  const errors = [];

  if (!product) {
    errors.push({
      field: "productId",
      message: "Product not found",
    });
  } else if (product.status === "INACTIVE") {
    errors.push({
      field: "productId",
      message: "Product is inactive",
    });
  }

  if (!location) {
    errors.push({
      field: "locationId",
      message: "Location not found",
    });
  } else if (location.status === "INACTIVE") {
    errors.push({
      field: "locationId",
      message: "Location is inactive",
    });
  }

  if (errors.length > 0) {
    throw new AppError("Validation failed", 400, errors);
  }

  if (!product || !location) {
    throw new Error("Validation failed");
  }

  if (location.warehouseManaged) {
    throw new AppError(
      "Stock adjustments for this location must be submitted through Warehouse Operations",
      409,
      [
        {
          field: "locationId",
          message:
            "Open Warehouse Operations and submit the adjustment from its source bin.",
        },
      ],
    );
  }

  const stock = await findStockByProductAndLocation(
    data.productId,
    data.locationId,
  );

  if (!stock) {
    throw new AppError("Validation failed", 400, [
      {
        field: "stock",
        message: "Stock record not found",
      },
    ]);
  }

  return createAdjustmentTransaction(data, stock, product.reorderLevel, createStockLowEvent);
};

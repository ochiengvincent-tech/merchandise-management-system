const parseFlag = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`Invalid feature flag value: ${value}`);
};

export const featureFlags = {
  vendorManagement: parseFlag(
    process.env.FEATURE_VENDOR_MANAGEMENT_ENABLED,
    true,
  ),
  inventory: parseFlag(process.env.FEATURE_INVENTORY_ENABLED, true),
  procurement: parseFlag(process.env.FEATURE_PROCUREMENT_ENABLED, true),
  receiving: parseFlag(process.env.FEATURE_RECEIVING_ENABLED, false),
  warehouseOperations: parseFlag(
    process.env.FEATURE_WAREHOUSE_OPERATIONS_ENABLED,
    false,
  ),
  retailSales: parseFlag(process.env.FEATURE_RETAIL_SALES_ENABLED, false),
  salesAudit: parseFlag(process.env.FEATURE_SALES_AUDIT_ENABLED, false),
  financials: parseFlag(process.env.FEATURE_FINANCIALS_ENABLED, false),
} as const;

const parseFlag = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid feature flag value: ${value}`);
};

export const featureFlags = {
  vendorManagement: parseFlag(
    import.meta.env.VITE_FEATURE_VENDOR_MANAGEMENT_ENABLED,
    true,
  ),
  inventory: parseFlag(import.meta.env.VITE_FEATURE_INVENTORY_ENABLED, true),
  procurement: parseFlag(
    import.meta.env.VITE_FEATURE_PROCUREMENT_ENABLED,
    true,
  ),
  receiving: parseFlag(import.meta.env.VITE_FEATURE_RECEIVING_ENABLED, false),
  warehouseOperations: parseFlag(
    import.meta.env.VITE_FEATURE_WAREHOUSE_OPERATIONS_ENABLED,
    false,
  ),
  retailSales: parseFlag(
    import.meta.env.VITE_FEATURE_RETAIL_SALES_ENABLED,
    false,
  ),
  salesAudit: parseFlag(import.meta.env.VITE_FEATURE_SALES_AUDIT_ENABLED, false),
  financials: parseFlag(import.meta.env.VITE_FEATURE_FINANCIALS_ENABLED, false),
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;
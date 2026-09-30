import { z } from "zod";
import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import { featureFlags } from "../../lib/feature-flags";

export const auditSources = [
  "PROCUREMENT",
  "INVENTORY",
  "VENDOR_MANAGEMENT",
  "RECEIVING",
  "RETAIL_SALES",
  "WAREHOUSE_OPERATIONS",
  "SALES_AUDIT",
  "FINANCIALS",
] as const;
export type AuditSource = (typeof auditSources)[number];
export type AuditSourceFilter = AuditSource | "ALL";

const auditRecordSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actorId: z.string().nullable().optional(),
  createdAt: z.string(),
  purchaseOrderId: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  vendorId: z.string().nullable().optional(),
  vendorProductId: z.string().nullable().optional(),
  goodsReceiptId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  binId: z.string().nullable().optional(),
  movementId: z.string().nullable().optional(),
  recordId: z.string().nullable().optional(),
  beforeState: z.unknown().optional(),
  afterState: z.unknown().optional(),
  details: z.unknown().nullable().optional(),
  signature: z.string().optional(),
}).passthrough();

const auditResponseSchema = z.object({
  data: z.array(auditRecordSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type AuditRecord = z.infer<typeof auditRecordSchema> & {
  source: AuditSource;
};

export type AuditFilters = {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

const services: Array<{ source: AuditSource; baseUrl: string }> = [
  { source: "PROCUREMENT", baseUrl: API_URLS.procurement },
  { source: "INVENTORY", baseUrl: API_URLS.inventory },
  { source: "VENDOR_MANAGEMENT", baseUrl: API_URLS.vendor },
  { source: "RECEIVING", baseUrl: API_URLS.receiving },
  { source: "RETAIL_SALES", baseUrl: API_URLS.retailSales },
  { source: "WAREHOUSE_OPERATIONS", baseUrl: API_URLS.warehouse },
  { source: "SALES_AUDIT", baseUrl: API_URLS.salesAudit },
  { source: "FINANCIALS", baseUrl: API_URLS.financials },
];

export async function listAuditRecords(
  sourceFilter: AuditSourceFilter,
  filters: AuditFilters,
) {
  const selected = services.filter(
    ({ source }) =>
      (source !== "RECEIVING" || featureFlags.receiving) &&
      (source !== "RETAIL_SALES" || featureFlags.retailSales) &&
      (source !== "WAREHOUSE_OPERATIONS" || featureFlags.warehouseOperations) &&
      (source !== "SALES_AUDIT" || featureFlags.salesAudit) &&
      (source !== "FINANCIALS" || featureFlags.financials) &&
      (sourceFilter === "ALL" || sourceFilter === source),
  );
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.action) query.set("action", filters.action);
  if (filters.actorId) query.set("actorId", filters.actorId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  const results = await Promise.allSettled(selected.map(async ({ source, baseUrl }) => {
    const response = await apiRequest<unknown>(`${baseUrl}/audit-logs?${query}`);
    return { source, ...auditResponseSchema.parse(response) };
  }));

  const data: AuditRecord[] = [];
  const errors: Array<{ source: AuditSource; message: string }> = [];
  let total = 0;
  let hasMore = false;

  results.forEach((result, index) => {
    const source = selected[index].source;
    if (result.status === "rejected") {
      errors.push({
        source,
        message: result.reason instanceof Error ? result.reason.message : "Could not load audit events.",
      });
      return;
    }
    total += result.value.pagination.total;
    hasMore ||= result.value.pagination.totalPages > filters.page;
    data.push(...result.value.data.map((record) => ({ ...record, source })));
  });

  data.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return { data, errors, total, hasMore };
}

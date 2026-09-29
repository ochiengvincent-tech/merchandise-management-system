import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  listAuditRecords,
  type AuditRecord,
  type AuditSourceFilter,
} from "../features/audit/api";
import { featureFlags } from "../lib/feature-flags";

const PAGE_SIZE = 20;
const sourceLabels = {
  ALL: "All services",
  PROCUREMENT: "Procurement",
  INVENTORY: "Inventory",
  VENDOR_MANAGEMENT: "Vendor Management",
  RECEIVING: "Receiving",
  RETAIL_SALES: "Retail Sales",
  WAREHOUSE_OPERATIONS: "Warehouse Operations",
  SALES_AUDIT: "Sales Audit",
} as const;

function resourceId(record: AuditRecord) {
  return record.goodsReceiptId ?? record.sessionId ?? record.movementId ?? record.binId ?? record.purchaseOrderId ?? record.recordId ?? record.productId ?? record.locationId ?? record.vendorProductId ?? record.vendorId ?? "—";
}

function eventDetails(record: AuditRecord) {
  const detail = record.details ?? (record.afterState !== undefined
    ? { before: record.beforeState ?? null, after: record.afterState }
    : record.beforeState ?? null);
  if (detail === null || detail === undefined) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditPage() {
  const [source, setSource] = useState<AuditSourceFilter>("ALL");
  const [sourceInput, setSourceInput] = useState<AuditSourceFilter>("ALL");
  const [draftFilters, setDraftFilters] = useState({ action: "", actorId: "", from: "", to: "" });
  const [filters, setFilters] = useState({ action: "", actorId: "", from: "", to: "" });
  const [filterError, setFilterError] = useState("");
  const [page, setPage] = useState(1);
  const actorId = filters.actorId.trim();
  const action = filters.action.trim();
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).toISOString() : undefined;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).toISOString() : undefined;
  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextActorId = draftFilters.actorId.trim();
    if (nextActorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nextActorId)) {
      setFilterError("Enter a valid actor UUID or clear the Actor ID filter.");
      return;
    }
    if (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) {
      setFilterError("The From date must be on or before the To date.");
      return;
    }
    setFilterError("");
    setSource(sourceInput);
    setFilters(draftFilters);
    setPage(1);
  };
  const clearFilters = () => {
    const emptyFilters = { action: "", actorId: "", from: "", to: "" };
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setSourceInput("ALL");
    setSource("ALL");
    setFilterError("");
    setPage(1);
  };
  const auditQuery = useQuery({
    queryKey: ["audit-logs", source, action, actorId, from, to, page],
    queryFn: () => listAuditRecords(source, {
      page,
      limit: PAGE_SIZE,
      action: action || undefined,
      actorId: actorId || undefined,
      from,
      to,
    }),
    staleTime: 15_000,
  });
  const result = auditQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Audit trail</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review important operational events recorded across enabled services.
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <form onSubmit={applyFilters}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm font-medium text-slate-700">
            Service
            <Select
              className="mt-1"
              value={sourceInput}
              onChange={(event) => {
                const nextSource = event.target.value as AuditSourceFilter;
                setSourceInput(nextSource);
                setSource(nextSource);
                setPage(1);
              }}
            >
              <option value="ALL">All services</option>
              <option value="PROCUREMENT">Procurement</option>
              <option value="INVENTORY">Inventory</option>
              <option value="VENDOR_MANAGEMENT">Vendor Management</option>
              {featureFlags.receiving && <option value="RECEIVING">Receiving</option>}
              {featureFlags.retailSales && <option value="RETAIL_SALES">Retail Sales</option>}
              {featureFlags.warehouseOperations && <option value="WAREHOUSE_OPERATIONS">Warehouse Operations</option>}
              {featureFlags.salesAudit && <option value="SALES_AUDIT">Sales Audit</option>}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Action
            <Input className="mt-1" value={draftFilters.action} onChange={(event) => setDraftFilters((current) => ({ ...current, action: event.target.value }))} placeholder="Exact action, e.g. PO_SUBMITTED_FOR_APPROVAL" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Actor ID
            <Input className="mt-1" value={draftFilters.actorId} onChange={(event) => setDraftFilters((current) => ({ ...current, actorId: event.target.value }))} placeholder="Filter by actor UUID" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            From
            <Input className="mt-1" type="date" value={draftFilters.from} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            To
            <Input className="mt-1" type="date" value={draftFilters.to} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </Card>

      {filterError && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{filterError}</Card>}
      {auditQuery.isError && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          Could not load audit events. {auditQuery.error instanceof Error ? auditQuery.error.message : "Try again."}
        </Card>
      )}
      {result?.errors.map(({ source: failedSource }) => (
        <Card key={failedSource} className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          {sourceLabels[failedSource]} events could not be loaded. Please try again in a moment. Other available service records remain visible.
        </Card>
      ))}

      <Card className="overflow-hidden p-0">
        {auditQuery.isLoading && <p role="status" className="p-8 text-center text-sm text-slate-500">Loading audit events…</p>}
        {result && result.data.length === 0 && (
          <p role="status" className="p-10 text-center text-sm text-slate-600">
            {result.errors.length > 0 ? "Audit events are unavailable from one or more selected services." : "No audit events match these filters."}
          </p>
        )}
        {!!result?.data.length && (
          <TableContainer className="rounded-none border-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Event</TableHeader>
                  <TableHeader>Service</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Record</TableHeader>
                  <TableHeader>Time</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.data.map((record) => {
                  const details = eventDetails(record);
                  return (
                    <TableRow key={`${record.source}:${record.id}`}>
                      <TableCell className="min-w-64">
                        <p className="font-semibold text-slate-900">{record.action.replaceAll("_", " ")}</p>
                        {details && (
                          <details className="mt-1 max-w-xl">
                            <summary className="cursor-pointer text-xs font-medium text-blue-700 hover:text-blue-900">View event details</summary>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{details}</pre>
                          </details>
                        )}
                        {record.signature && <p className="mt-1 text-xs text-slate-500">Integrity signature recorded</p>}
                      </TableCell>
                      <TableCell><Badge variant={record.source === "PROCUREMENT" ? "info" : record.source === "INVENTORY" ? "success" : record.source === "RECEIVING" ? "partial" : "default"}>{sourceLabels[record.source]}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{record.actorId ?? "System"}</TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={resourceId(record)}>{resourceId(record)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-slate-600">{formatTimestamp(record.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {result && (result.total > 0 || page > 1) && (
          <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-500">
              {result.data.length} events shown (up to {PAGE_SIZE} per service) · {result.total} matching across selected service{source === "ALL" ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page === 1 || auditQuery.isFetching} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <span className="px-2 text-sm text-slate-600">Page {page}</span>
              <Button variant="secondary" disabled={!result.hasMore || auditQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

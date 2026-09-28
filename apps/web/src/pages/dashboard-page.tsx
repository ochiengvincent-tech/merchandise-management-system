import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { getStockByProduct } from "../features/inventory/api";
import { getLocations } from "../features/locations/api";
import { getProducts } from "../features/products/api";
import { listPurchaseOrders } from "../features/purchase-orders/api";
import { getVendors } from "../features/vendors/api";
import { featureFlags } from "../lib/feature-flags";

const PO_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;

const statusVariant = (status: string): "default" | "success" | "danger" => {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  return "default";
};

const formatAmount = (amount: string, currency: string) =>
  `${currency} ${Number(amount).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function DashboardPage() {
  const navigate = useNavigate();
  const procurementEnabled = featureFlags.procurement;
  const inventoryEnabled = featureFlags.inventory;
  const vendorsEnabled = featureFlags.vendorManagement;

  const statusQueries = useQueries({
    queries: PO_STATUSES.map((status) => ({
      queryKey: ["dashboard", "purchase-orders", status],
      queryFn: () => listPurchaseOrders({ status, limit: 1 }),
      enabled: procurementEnabled,
      staleTime: 30_000,
    })),
  });
  const recentOrdersQuery = useQuery({
    queryKey: ["dashboard", "recent-purchase-orders"],
    queryFn: () => listPurchaseOrders({ page: 1, limit: 6 }),
    enabled: procurementEnabled,
    staleTime: 30_000,
  });
  const productsQuery = useQuery({
    queryKey: ["dashboard", "active-products"],
    queryFn: () => getProducts({ status: "ACTIVE" }),
    enabled: inventoryEnabled,
    staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ["dashboard", "active-locations"],
    queryFn: () => getLocations({ status: "ACTIVE" }),
    enabled: inventoryEnabled,
    staleTime: 60_000,
  });
  const vendorsQuery = useQuery({
    queryKey: ["dashboard", "active-vendors"],
    queryFn: () => getVendors({ status: "ACTIVE", limit: 1 }),
    enabled: vendorsEnabled,
    staleTime: 60_000,
  });

  const products = productsQuery.data ?? [];
  const stockQueries = useQueries({
    queries: products.map((product) => ({
      queryKey: ["dashboard", "stock", product.id],
      queryFn: () => getStockByProduct(product.id),
      enabled: inventoryEnabled,
      staleTime: 30_000,
    })),
  });
  const stockIsLoading = productsQuery.isLoading || stockQueries.some((query) => query.isLoading);
  const stockHasError = productsQuery.isError || stockQueries.some((query) => query.isError);
  const lowStockCount = useMemo(() => {
    let count = 0;
    products.forEach((product, index) => {
      const records = stockQueries[index]?.data;
      if (!records) return;
      const available = records.reduce((total, stock) => total + stock.quantityAvailable, 0);
      if (available <= product.reorderLevel) count += 1;
    });
    return count;
  }, [products, stockQueries]);

  const statusTotals = Object.fromEntries(
    PO_STATUSES.map((status, index) => [status, statusQueries[index]?.data?.pagination.total ?? 0]),
  ) as Record<(typeof PO_STATUSES)[number], number>;
  const statusLoading = statusQueries.some((query) => query.isLoading);
  const statusHasError = statusQueries.some((query) => query.isError);
  const recentOrders = recentOrdersQuery.data?.data ?? [];
  const totalOpenOrders =
    statusTotals.DRAFT +
    statusTotals.PENDING_APPROVAL +
    statusTotals.APPROVED +
    statusTotals.SENT +
    statusTotals.PARTIALLY_RECEIVED;
  const attentionCount = statusTotals.PENDING_APPROVAL + statusTotals.PARTIALLY_RECEIVED;

  const number = (value: number, loading: boolean, error: boolean) =>
    loading ? "…" : error ? "—" : value.toLocaleString("en-KE");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Operational overview across merchandising, suppliers and procurement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {procurementEnabled && (
            <>
              <Button variant="secondary" onClick={() => navigate("/approvals")}>Review approvals</Button>
              <Button onClick={() => navigate("/purchase-orders/new")}>New purchase order</Button>
            </>
          )}
        </div>
      </div>

      <section aria-label="Operational summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Open purchase orders" value={number(totalOpenOrders, statusLoading, statusHasError)} helper="Excludes completed and cancelled orders" onClick={() => navigate("/purchase-orders")} />
        <SummaryCard label="Awaiting approval" value={number(statusTotals.PENDING_APPROVAL, statusLoading, statusHasError)} helper="Purchase orders requiring a decision" onClick={() => navigate("/approvals")} />
        <SummaryCard label="Partially received" value={number(statusTotals.PARTIALLY_RECEIVED, statusLoading, statusHasError)} helper="Orders with quantities still outstanding" onClick={() => navigate("/purchase-orders")} />
        {inventoryEnabled ? (
          <SummaryCard label="Products at or below reorder level" value={number(lowStockCount, stockIsLoading, stockHasError)} helper="Based on total available stock across locations" onClick={() => navigate("/inventory")} />
        ) : (
          <SummaryCard label="Active vendors" value={number(vendorsQuery.data?.total ?? 0, vendorsQuery.isLoading, vendorsQuery.isError)} helper="Vendors available for purchasing" onClick={() => navigate("/vendors")} />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Draft orders</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{number(statusTotals.DRAFT, statusLoading, statusHasError)}</p>
          <div className="mt-2"><Button variant="ghost" onClick={() => navigate("/purchase-orders")}>View purchase orders</Button></div>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Sent and awaiting delivery</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{number(statusTotals.SENT, statusLoading, statusHasError)}</p>
          <p className="mt-1 text-xs text-slate-500">Includes orders not yet partially received.</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Needs attention</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{number(attentionCount, statusLoading, statusHasError)}</p>
          <p className="mt-1 text-xs text-slate-500">{number(statusTotals.PENDING_APPROVAL, statusLoading, statusHasError)} approvals and {number(statusTotals.PARTIALLY_RECEIVED, statusLoading, statusHasError)} partial receipts.</p>
        </Card>
      </section>

      {procurementEnabled && (
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Recent purchase orders</h2>
              <p className="mt-1 text-sm text-slate-500">Latest procurement activity.</p>
            </div>
            <Button variant="secondary" onClick={() => navigate("/purchase-orders")}>View all</Button>
          </div>
          {recentOrdersQuery.isError ? (
            <p className="p-5 text-sm text-red-700" role="alert">Could not load recent purchase orders.</p>
          ) : recentOrdersQuery.isLoading ? (
            <p className="p-5 text-sm text-slate-500" role="status">Loading purchase orders…</p>
          ) : recentOrders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900">No purchase orders yet</p>
              <p className="mt-1 text-sm text-slate-500">Create a purchase order to start tracking procurement activity.</p>
            </div>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>PO number</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Amount</TableHeader>
                    <TableHeader>Created</TableHeader>
                    <TableHeader><span className="sr-only">Open</span></TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium text-slate-950">{order.poNumber}</TableCell>
                      <TableCell><Badge variant={statusVariant(order.status)}>{order.status.replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell>{formatAmount(order.totalAmount, order.currency)}</TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell><Button variant="ghost" onClick={() => navigate(`/purchase-orders/${order.id}`)}>Open</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      <section aria-label="Master data overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {inventoryEnabled && (
          <SummaryCard label="Active products" value={number(products.length, productsQuery.isLoading, productsQuery.isError)} helper="Inventory product master" onClick={() => navigate("/products")} />
        )}
        {inventoryEnabled && (
          <SummaryCard label="Active locations" value={number(locationsQuery.data?.length ?? 0, locationsQuery.isLoading, locationsQuery.isError)} helper="Warehouses and stores" onClick={() => navigate("/locations")} />
        )}
        {vendorsEnabled && (
          <SummaryCard label="Active vendors" value={number(vendorsQuery.data?.total ?? 0, vendorsQuery.isLoading, vendorsQuery.isError)} helper="Available supplier records" onClick={() => navigate("/vendors")} />
        )}
      </section>
    </div>
  );
}

type SummaryCardProps = {
  label: string;
  value: string;
  helper: string;
  onClick: () => void;
};

function SummaryCard({ label, value, helper, onClick }: SummaryCardProps) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      <Card className="h-full p-5 transition-colors hover:border-slate-300 hover:bg-slate-50">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
      </Card>
    </button>
  );
}

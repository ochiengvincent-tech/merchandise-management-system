import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useGoodsReceipts, useOpenPurchaseOrders } from "../../features/receiving/hooks";
import { ReceiveGoodsForm } from "../../features/receiving/receive-goods-form";
import { usePurchaseOrderReferences } from "../../features/purchase-orders/hooks";

const PAGE_SIZE = 20;

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceivingPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const openOrdersQuery = useOpenPurchaseOrders({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
  });
  const receiptsQuery = useGoodsReceipts({ page: 1, limit: 10 });

  const openOrders = openOrdersQuery.data?.data ?? [];
  const receipts = receiptsQuery.data?.data ?? [];
  const references = usePurchaseOrderReferences(
    [...new Set(openOrders.map((order) => order.vendorId))],
    [...new Set(openOrders.map((order) => order.destinationLocationId))],
  );
  const totalPages = Math.max(1, openOrdersQuery.data?.pagination.totalPages ?? 1);

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Receiving</h1>
        <p className="mt-1 text-sm text-slate-500">
          Inspect supplier deliveries against sent purchase orders and record accepted quantities.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Purchase orders ready to receive</h2>
          <p className="mt-1 text-sm text-slate-500">
            Orders appear here after they are sent to the vendor, until all ordered quantities are received.
          </p>
        </div>
        <label htmlFor="receiving-po-search" className="block max-w-xl text-sm font-medium text-slate-700">
          Search purchase orders
          <Input
            id="receiving-po-search"
            className="mt-1.5"
            type="search"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search by PO number"
          />
        </label>

        {openOrdersQuery.isLoading && (
          <p className="py-6 text-center text-sm text-slate-500" role="status">Loading open purchase orders…</p>
        )}
        {openOrdersQuery.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <p className="font-medium">Could not load purchase orders for receiving.</p>
            <p className="mt-1">{openOrdersQuery.error.message}</p>
          </div>
        )}
        {openOrdersQuery.isSuccess && openOrders.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="font-medium text-slate-800">No open purchase orders to receive</p>
            <p className="mt-1 text-sm text-slate-500">
              {search.trim() ? "Try a different PO number." : "Sent and partially received orders will appear here."}
            </p>
          </div>
        )}
        {openOrdersQuery.isSuccess && openOrders.length > 0 && (
          <>
            <TableContainer className="rounded-lg">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>PO number</TableHeader>
                    <TableHeader>Supplier</TableHeader>
                    <TableHeader>Destination</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Requested delivery</TableHeader>
                    <TableHeader>Action</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {openOrders.map((order) => {
                    const vendor = references.vendors.get(order.vendorId);
                    const location = references.locations.get(order.destinationLocationId);
                    return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium text-slate-900">{order.poNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{vendor?.name ?? "Supplier details unavailable"}</p>
                        {vendor?.vendorCode && <p className="text-xs text-slate-500">{vendor.vendorCode}</p>}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{location?.name ?? "Location details unavailable"}</p>
                        {location?.locationCode && <p className="text-xs text-slate-500">{location.locationCode}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.status === "PARTIALLY_RECEIVED" ? "partial" : "sent"}>
                          {order.status === "PARTIALLY_RECEIVED" ? "Partially received" : "Sent"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.requestedDeliveryDate ? formatDate(order.requestedDeliveryDate) : "Not specified"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={selectedPurchaseOrderId === order.id ? "secondary" : "primary"}
                          onClick={() => setSelectedPurchaseOrderId((current) => current === order.id ? "" : order.id)}
                        >
                          {selectedPurchaseOrderId === order.id ? "Close form" : "Receive items"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>Page {page} of {totalPages} · {openOrdersQuery.data?.pagination.total ?? 0} orders</span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {selectedPurchaseOrderId && <ReceiveGoodsForm purchaseOrderId={selectedPurchaseOrderId} />}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Recent goods received notes</h2>
            <p className="mt-1 text-sm text-slate-500">Latest delivery records and their Procurement sync status.</p>
          </div>
        </div>
        {receiptsQuery.isLoading && <p className="p-6 text-center text-sm text-slate-500" role="status">Loading receipt records…</p>}
        {receiptsQuery.isError && (
          <p className="p-5 text-sm text-red-800" role="alert">Could not load goods received notes. {receiptsQuery.error.message}</p>
        )}
        {receiptsQuery.isSuccess && receipts.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">No goods received notes have been recorded yet.</p>
        )}
        {receiptsQuery.isSuccess && receipts.length > 0 && (
          <TableContainer className="rounded-none border-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>GRN</TableHeader>
                  <TableHeader>Purchase order</TableHeader>
                  <TableHeader>Received</TableHeader>
                  <TableHeader>Sync status</TableHeader>
                  <TableHeader>Details</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-medium text-slate-900">{receipt.grnNumber}</TableCell>
                    <TableCell>{receipt.purchaseOrderId}</TableCell>
                    <TableCell>{formatDate(receipt.receivedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={receipt.procurementSyncStatus === "SYNCED" ? "success" : "warning"}>
                        {receipt.procurementSyncStatus === "SYNCED" ? "Synced" : receipt.procurementSyncStatus === "PENDING" ? "Sync pending" : "Retrying"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link className="font-medium text-teal-800 underline-offset-4 hover:underline" to={`/receiving/receipts/${receipt.id}`}>View GRN</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}

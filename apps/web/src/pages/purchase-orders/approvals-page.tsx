import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  usePurchaseOrderReferences,
  usePurchaseOrders,
} from "../../features/purchase-orders/hooks";

const PAGE_SIZE = 20;

function formatAmount(amount: string, currency: string) {
  return `${currency} ${Number(amount).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ApprovalsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const purchaseOrdersQuery = usePurchaseOrders({
    page,
    limit: PAGE_SIZE,
    status: "PENDING_APPROVAL",
  });
  const purchaseOrders = purchaseOrdersQuery.data?.data ?? [];
  const references = usePurchaseOrderReferences(
    [...new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.vendorId))],
    [
      ...new Set(
        purchaseOrders.map(
          (purchaseOrder) => purchaseOrder.destinationLocationId,
        ),
      ),
    ],
  );

  const total = purchaseOrdersQuery.data?.pagination.total ?? 0;
  const totalPages = Math.max(
    1,
    purchaseOrdersQuery.data?.pagination.totalPages ?? 1,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Approvals
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review purchase orders waiting for a decision.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        {purchaseOrdersQuery.isLoading && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            Loading approval queue...
          </div>
        )}

        {purchaseOrdersQuery.isError && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-red-700">
              Unable to load the approval queue.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {purchaseOrdersQuery.error instanceof Error
                ? purchaseOrdersQuery.error.message
                : "An unexpected error occurred."}
            </p>
          </div>
        )}

        {purchaseOrdersQuery.isSuccess && purchaseOrders.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              No purchase orders are waiting for approval.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Orders submitted for review will appear here.
            </p>
          </div>
        )}

        {purchaseOrdersQuery.isSuccess && purchaseOrders.length > 0 && (
          <>
            <TableContainer className="rounded-none border-0">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>PO Number</TableHeader>
                    <TableHeader>Vendor</TableHeader>
                    <TableHeader>Destination</TableHeader>
                    <TableHeader>Total</TableHeader>
                    <TableHeader>Last updated</TableHeader>
                    <TableHeader>Status</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purchaseOrders.map((purchaseOrder) => {
                    const vendor = references.vendors.get(
                      purchaseOrder.vendorId,
                    );
                    const location = references.locations.get(
                      purchaseOrder.destinationLocationId,
                    );

                    return (
                      <TableRow
                        key={purchaseOrder.id}
                        onClick={() =>
                          navigate(`/purchase-orders/${purchaseOrder.id}`)
                        }
                        className="cursor-pointer"
                      >
                        <TableCell className="font-medium text-slate-900">
                          {purchaseOrder.poNumber}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">
                              {vendor?.name ?? "Loading..."}
                            </p>
                            {vendor?.vendorCode && (
                              <p className="text-xs text-slate-500">
                                {vendor.vendorCode}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">
                              {location?.name ?? "Loading..."}
                            </p>
                            {location?.locationCode && (
                              <p className="text-xs text-slate-500">
                                {location.locationCode}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums text-slate-900">
                          {formatAmount(
                            purchaseOrder.totalAmount,
                            purchaseOrder.currency,
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {formatDate(purchaseOrder.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge>{purchaseOrder.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, total)} of {total} pending orders
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={page === 1 || purchaseOrdersQuery.isFetching}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="px-2 text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={
                    page === totalPages || purchaseOrdersQuery.isFetching
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Icon } from "../../components/ui/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
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
import { purchaseOrderStatusVariant } from "../../features/purchase-orders/status";

function PurchaseOrdersPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const limit = 20;

  const purchaseOrdersQuery = usePurchaseOrders({
    page,
    limit,
    search: search || undefined,
    status: status || undefined,
  });

  const purchaseOrders = purchaseOrdersQuery.data?.data ?? [];

  const vendorIds = [
    ...new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.vendorId)),
  ];

  const locationIds = [
    ...new Set(
      purchaseOrders.map(
        (purchaseOrder) => purchaseOrder.destinationLocationId,
      ),
    ),
  ];

  const references = usePurchaseOrderReferences(vendorIds, locationIds);

  const total = purchaseOrdersQuery.data?.pagination.total ?? 0;
  const totalPages = Math.max(
    1,
    purchaseOrdersQuery.data?.pagination.totalPages ?? 1,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const formatAmount = (amount: string, currency: string) =>
    `${currency} ${Number(amount).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">
            Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage purchase orders and procurement commitments.
          </p>
        </div>

        <Button onClick={() => navigate("/purchase-orders/new")}>
          <Icon name="plus" className="mr-2 h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="purchase-order-search"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <Input
              id="purchase-order-search"
              type="search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search PO number or status"
            />
          </div>

          <div>
            <label
              htmlFor="purchase-order-status"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Status
            </label>

            <Select
              id="purchase-order-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="SENT">Sent</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {purchaseOrdersQuery.isLoading && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            Loading purchase orders...
          </div>
        )}

        {purchaseOrdersQuery.isError && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-red-700">
              Unable to load purchase orders.
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
              No purchase orders found.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing the filters or create a new purchase order.
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
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Total</TableHeader>
                    <TableHeader>Created</TableHeader>
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

                        <TableCell>
                          <Badge variant={purchaseOrderStatusVariant(purchaseOrder.status)}>
                            {purchaseOrder.status}
                          </Badge>
                        </TableCell>

                        <TableCell className="font-medium tabular-nums text-slate-900">
                          {formatAmount(
                            purchaseOrder.totalAmount,
                            purchaseOrder.currency,
                          )}
                        </TableCell>

                        <TableCell className="text-slate-600">
                          {formatDate(purchaseOrder.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {(page - 1) * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-slate-700">
                  {Math.min(page * limit, total)}
                </span>{" "}
                of <span className="font-medium text-slate-700">{total}</span>{" "}
                purchase orders
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
                    page >= totalPages || purchaseOrdersQuery.isFetching
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

export default PurchaseOrdersPage;

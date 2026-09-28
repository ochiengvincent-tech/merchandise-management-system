import { useParams } from "react-router-dom";
import { useSmartBack } from "../../hooks/use-smart-back";

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
  usePurchaseOrder,
  usePurchaseOrderReferences,
} from "../../features/purchase-orders/hooks";
import { PurchaseOrderActions } from "../../features/purchase-orders/purchase-order-actions";
import { PurchaseOrderAmendments } from "../../features/purchase-orders/purchase-order-amendments";
import { EditDraftPurchaseOrder } from "../../features/purchase-orders/edit-draft-purchase-order";

function PurchaseOrderDetailPage() {
  const { id = "" } = useParams();
  const goBack = useSmartBack("/purchase-orders");

  const purchaseOrderQuery = usePurchaseOrder(id);

  const purchaseOrder = purchaseOrderQuery.data?.data;
  const lines = purchaseOrder?.lines ?? [];

  const vendorIds = purchaseOrder ? [purchaseOrder.vendorId] : [];
  const locationIds = purchaseOrder
    ? [purchaseOrder.destinationLocationId]
    : [];
  const productIds = [...new Set(lines.map((line) => line.productId))];

  const references = usePurchaseOrderReferences(
    vendorIds,
    locationIds,
    productIds,
  );

  const formatAmount = (amount: string, currency: string) =>
    `${currency} ${Number(amount).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDateTime = (date: string | null) => {
    if (!date) {
      return "Not available";
    }

    return new Date(date).toLocaleString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: string | null) => {
    if (!date) {
      return "Not specified";
    }

    return new Date(`${date}T00:00:00`).toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusVariant = (
    status: string,
  ): "default" | "success" | "danger" => {
    if (status === "COMPLETED") {
      return "success";
    }

    if (status === "CANCELLED") {
      return "danger";
    }

    return "default";
  };

  if (purchaseOrderQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-200" />
        </div>

        <Card className="p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-5 w-40 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-0">
          <div className="h-12 border-b border-slate-200 bg-slate-50" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 border-b border-slate-100" />
          ))}
        </Card>
      </div>
    );
  }

  if (purchaseOrderQuery.isError || !purchaseOrder) {
    return (
      <div className="space-y-4">
        <Button
          variant="secondary"
          onClick={goBack}
        >
          Back
        </Button>

        <Card className="p-6">
          <p className="text-sm font-medium text-red-700">
            Unable to load purchase order
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {purchaseOrderQuery.error instanceof Error
              ? purchaseOrderQuery.error.message
              : "The requested purchase order could not be found."}
          </p>
        </Card>
      </div>
    );
  }

  const vendor = references.vendors.get(purchaseOrder.vendorId);
  const location = references.locations.get(
    purchaseOrder.destinationLocationId,
  );

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={goBack}
          className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back
        </button>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                {purchaseOrder.poNumber}
              </h1>

              <Badge variant={getStatusVariant(purchaseOrder.status)}>
                {purchaseOrder.status}
              </Badge>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Purchase order details and procurement commitment.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={goBack}
            >
              Back
            </Button>
          </div>
        </div>
      </div>

      <PurchaseOrderActions purchaseOrder={purchaseOrder} />
      <EditDraftPurchaseOrder purchaseOrder={purchaseOrder} />
      <PurchaseOrderAmendments purchaseOrder={purchaseOrder} />

      <Card className="p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Purchase Order Information
          </h2>

          <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                PO Number
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                {purchaseOrder.poNumber}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </p>
              <div className="mt-1">
                <Badge variant={getStatusVariant(purchaseOrder.status)}>
                  {purchaseOrder.status}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Currency
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {purchaseOrder.currency}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Vendor
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                {vendor?.name ?? "Loading..."}
              </p>
              <p className="text-xs text-slate-500">
                {vendor?.vendorCode ?? ""}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Destination
              </p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                {location?.name ?? "Loading..."}
              </p>
              <p className="text-xs text-slate-500">
                {location?.locationCode ?? ""}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Requested Delivery
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {formatDate(purchaseOrder.requestedDeliveryDate)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Payment Terms
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {purchaseOrder.paymentTerms}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {formatDateTime(purchaseOrder.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Approved
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {formatDateTime(purchaseOrder.approvedAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Sent
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {formatDateTime(purchaseOrder.sentAt)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {purchaseOrder.cancellation && (
        <Card className="border-red-200 bg-red-50 p-6">
          <h2 className="text-base font-semibold text-red-950">Cancellation</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-red-800">
                Reason
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-red-950">
                {purchaseOrder.cancellation.reason}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-red-800">
                Cancelled by
              </dt>
              <dd className="mt-1 break-all text-sm text-red-950">
                {purchaseOrder.cancellation.cancelledBy}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-red-800">
                Cancelled at
              </dt>
              <dd className="mt-1 text-sm text-red-950">
                {formatDateTime(purchaseOrder.cancellation.cancelledAt)}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            Order Lines
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Products and quantities included in this purchase order.
          </p>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            This purchase order has no lines.
          </div>
        ) : (
          <TableContainer className="rounded-none border-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Product</TableHeader>
                  <TableHeader>Ordered</TableHeader>
                  <TableHeader>Received</TableHeader>
                  <TableHeader>Remaining</TableHeader>
                  <TableHeader>Unit Price</TableHeader>
                  <TableHeader>Line Total</TableHeader>
                </TableRow>
              </TableHead>

              <TableBody>
                {lines.map((line) => {
                  const product = references.products.get(line.productId);
                  const remaining =
                    line.quantityOrdered - line.quantityReceived;

                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">
                            {product?.name ?? "Loading..."}
                          </p>
                          <p className="text-xs text-slate-500">
                            {product?.sku ?? ""}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="tabular-nums text-slate-700">
                        {line.quantityOrdered}
                      </TableCell>

                      <TableCell className="tabular-nums text-slate-700">
                        {line.quantityReceived}
                      </TableCell>

                      <TableCell className="font-medium tabular-nums text-slate-900">
                        {remaining}
                      </TableCell>

                      <TableCell className="tabular-nums text-slate-700">
                        {formatAmount(line.unitPrice, purchaseOrder.currency)}
                      </TableCell>

                      <TableCell className="font-medium tabular-nums text-slate-900">
                        {formatAmount(line.lineTotal, purchaseOrder.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <div className="flex justify-end">
        <Card className="w-full p-6 sm:w-96">
          <h2 className="text-base font-semibold text-slate-950">
            Order Summary
          </h2>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium tabular-nums text-slate-900">
                {formatAmount(purchaseOrder.subtotal, purchaseOrder.currency)}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">Total</span>
                <span className="text-lg font-semibold tabular-nums text-slate-950">
                  {formatAmount(
                    purchaseOrder.totalAmount,
                    purchaseOrder.currency,
                  )}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Notes</h2>

          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
            {purchaseOrder.notes || "No notes provided."}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-950">
          Record Information
        </h2>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Created
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {formatDateTime(purchaseOrder.createdAt)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Last Updated
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {formatDateTime(purchaseOrder.updatedAt)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Purchase Order ID
            </p>
            <p className="mt-1 break-all text-sm text-slate-700">
              {purchaseOrder.id}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Created By
            </p>
            <p className="mt-1 break-all text-sm text-slate-700">
              {purchaseOrder.createdBy}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default PurchaseOrderDetailPage;

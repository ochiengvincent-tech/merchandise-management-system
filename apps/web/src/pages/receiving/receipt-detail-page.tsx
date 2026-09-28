import { Link, useNavigate, useParams } from "react-router-dom";

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
import { useGoodsReceipt } from "../../features/receiving/hooks";
import {
  usePurchaseOrder,
  usePurchaseOrderReferences,
} from "../../features/purchase-orders/hooks";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncLabel(status: "PENDING" | "SYNCED" | "RETRYING") {
  if (status === "SYNCED") return "Synced to Procurement";
  if (status === "RETRYING") return "Sync retrying";
  return "Sync pending";
}

export function ReceiptDetailPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const receiptQuery = useGoodsReceipt(id);
  const receipt = receiptQuery.data;
  const purchaseOrderQuery = usePurchaseOrder(receipt?.purchaseOrderId ?? "");
  const purchaseOrder = purchaseOrderQuery.data?.data;
  const references = usePurchaseOrderReferences(
    purchaseOrder?.vendorId ? [purchaseOrder.vendorId] : [],
    purchaseOrder?.destinationLocationId ? [purchaseOrder.destinationLocationId] : [],
  );

  if (receiptQuery.isLoading) {
    return <Card className="p-6 text-sm text-slate-500" role="status">Loading goods received note…</Card>;
  }

  if (receiptQuery.isError || !receipt) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate("/receiving")}>Back to Receiving</Button>
        <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          <p className="font-semibold">Could not load this goods received note.</p>
          <p className="mt-1">{receiptQuery.error?.message ?? "The requested receipt may no longer be available."}</p>
        </Card>
      </div>
    );
  }

  const acceptedTotal = receipt.lines.reduce((total, line) => total + line.quantityAccepted, 0);
  const rejectedTotal = receipt.lines.reduce((total, line) => total + line.quantityRejected, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="secondary" onClick={() => navigate("/receiving")}>Back to Receiving</Button>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950">{receipt.grnNumber}</h1>
            <Badge variant={receipt.procurementSyncStatus === "SYNCED" ? "success" : "warning"}>
              {syncLabel(receipt.procurementSyncStatus)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">Goods received note and inspection details.</p>
        </div>
        <Link
          to={`/purchase-orders/${receipt.purchaseOrderId}`}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open purchase order
        </Link>
      </div>

      {receipt.procurementSyncStatus !== "SYNCED" && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <p className="font-semibold">This receipt has not finished syncing to Procurement.</p>
          <p className="mt-1">
            {receipt.procurementSyncError ?? "The system will retry automatically. Inventory updates are published after Procurement confirms the receipt."}
          </p>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Receipt information</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase order</dt>
            <dd className="mt-1 font-medium text-slate-900">{purchaseOrder?.poNumber ?? (purchaseOrderQuery.isLoading ? "Loading…" : receipt.purchaseOrderId)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</dt>
            <dd className="mt-1 text-slate-800">
              {references.vendors.get(purchaseOrder?.vendorId ?? "")?.name ?? "See linked purchase order"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received at</dt>
            <dd className="mt-1 text-slate-800">{formatDate(receipt.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received by</dt>
            <dd className="mt-1 break-all text-slate-800">{receipt.receivedBy}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier delivery note</dt>
            <dd className="mt-1 text-slate-800">{receipt.supplierDeliveryNote || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination location</dt>
            <dd className="mt-1 text-slate-800">
              {references.locations.get(receipt.destinationLocationId)?.name ?? "See linked purchase order"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity summary</dt>
            <dd className="mt-1 text-slate-800">{acceptedTotal} accepted · {rejectedTotal} rejected / excess</dd>
          </div>
        </dl>
        {receipt.notes && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receiving notes</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{receipt.notes}</p>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Inspected items</h2>
          <p className="mt-1 text-sm text-slate-500">Observed, damaged, accepted, and rejected quantities for this delivery.</p>
        </div>
        <TableContainer className="rounded-none border-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Product</TableHeader>
                <TableHeader>PO quantity at receipt</TableHeader>
                <TableHeader>Observed</TableHeader>
                <TableHeader>Damaged</TableHeader>
                <TableHeader>Accepted</TableHeader>
                <TableHeader>Rejected / excess</TableHeader>
                <TableHeader>Discrepancy</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipt.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <p className="font-medium text-slate-900">{line.productName ?? line.productCode}</p>
                    {line.productName && <p className="text-xs text-slate-500">{line.productCode}</p>}
                  </TableCell>
                  <TableCell>{line.quantityExpectedAtReceipt}</TableCell>
                  <TableCell>{line.quantityObserved}</TableCell>
                  <TableCell>{line.quantityDamaged}</TableCell>
                  <TableCell className="font-semibold text-emerald-800">{line.quantityAccepted}</TableCell>
                  <TableCell className={line.quantityRejected > 0 ? "font-semibold text-amber-800" : ""}>{line.quantityRejected}</TableCell>
                  <TableCell>
                    {line.discrepancies.length === 0 ? "—" : (
                      <div className="flex flex-wrap gap-1.5">
                        {line.discrepancies.map((discrepancy) => (
                          <Badge key={discrepancy} variant="warning">{discrepancy}</Badge>
                        ))}
                      </div>
                    )}
                    {line.notes && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-slate-500">{line.notes}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
}

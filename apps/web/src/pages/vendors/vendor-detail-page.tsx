import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSmartBack } from "../../hooks/use-smart-back";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { AddVendorProductForm } from "../../features/vendor-products/add-vendor-product-form";
import { VendorProductActions } from "../../features/vendor-products/vendor-product-actions";
import {
  useDeactivateVendor,
  useReactivateVendor,
  useVendor,
  useVendorReliability,
} from "../../features/vendors/hooks";
import { useVendorProducts } from "../../features/vendor-products/hooks";
import { useProducts } from "../../features/products/hooks";

function VendorDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const goBack = useSmartBack("/vendors");

  const [showAddProductForm, setShowAddProductForm] = useState(false);

  const vendorQuery = useVendor(id);
  const reliabilityQuery = useVendorReliability(id);
  const vendorProductsQuery = useVendorProducts(id);
  const productsQuery = useProducts();

  const deactivateMutation = useDeactivateVendor();
  const reactivateMutation = useReactivateVendor();

  if (vendorQuery.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Loading vendor...
      </div>
    );
  }

  if (vendorQuery.isError || !vendorQuery.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-950">
          Vendor not found
        </h1>

        <Button variant="secondary" onClick={goBack}>
          Back
        </Button>
      </div>
    );
  }

  const vendor = vendorQuery.data;
  const isActive = vendor.status === "ACTIVE";
  const isPending =
    deactivateMutation.isPending || reactivateMutation.isPending;

  const vendorProducts = vendorProductsQuery.data ?? [];
  const productMap = new Map(
    (productsQuery.data ?? []).map((product) => [product.id, product]),
  );

  const handleStatusChange = async () => {
    const confirmed = window.confirm(
      isActive
        ? `Deactivate "${vendor.name}"?`
        : `Reactivate "${vendor.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    if (isActive) {
      await deactivateMutation.mutateAsync(vendor.id);
      return;
    }

    await reactivateMutation.mutateAsync(vendor.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={goBack}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back
        </button>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950">
                {vendor.name}
              </h1>

              <Badge variant={isActive ? "success" : "default"}>
                {vendor.status}
              </Badge>
            </div>

            <p className="mt-1 text-sm text-slate-500">{vendor.vendorCode}</p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
            >
              Edit
            </Button>

            <Button
              variant={isActive ? "danger" : "secondary"}
              onClick={handleStatusChange}
              disabled={isPending}
            >
              {isPending
                ? "Updating..."
                : isActive
                  ? "Deactivate"
                  : "Reactivate"}
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Vendor Information
          </h2>

          <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Vendor Code
              </p>
              <p className="mt-1 text-sm text-slate-950">{vendor.vendorCode}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Name
              </p>
              <p className="mt-1 text-sm text-slate-950">{vendor.name}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {vendor.email || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Phone
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {vendor.phone || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Address
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {vendor.address || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Payment Terms
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {vendor.paymentTerms || "Not provided"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Supplier reliability</h2>
          <p className="mt-1 text-sm text-slate-500">
            Delivery performance over the last 12 months, based on lead times captured when each purchase order was sent.
          </p>
        </div>

        {reliabilityQuery.isLoading && (
          <p className="mt-5 text-sm text-slate-500">Loading delivery history...</p>
        )}
        {reliabilityQuery.isError && (
          <p className="mt-5 text-sm text-red-700" role="alert">Could not load supplier reliability.</p>
        )}
        {reliabilityQuery.isSuccess && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Overall score</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {reliabilityQuery.data.summary.score === null
                    ? "Not enough history"
                    : `${reliabilityQuery.data.summary.score} / 100`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {reliabilityQuery.data.summary.eligiblePurchaseOrders} eligible POs · 3 required
                </p>
              </div>
              {[
                ["On time", reliabilityQuery.data.summary.onTimeRate],
                ["Quantity fulfilled", reliabilityQuery.data.summary.fulfillmentRate],
                ["Undamaged", reliabilityQuery.data.summary.qualityRate],
              ].map(([label, rate]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{rate}%</p>
                </div>
              ))}
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Scoring period</p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {new Date(reliabilityQuery.data.summary.periodStart).toLocaleDateString()} – {new Date(reliabilityQuery.data.summary.periodEnd).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">Formula {reliabilityQuery.data.summary.formulaVersion}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Calculated {new Date(reliabilityQuery.data.summary.calculatedAt).toLocaleString()}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Score weights: on-time delivery 50%, quantity fulfillment 30%, and undamaged goods 20%. Only completed or overdue POs with lead-time snapshots are included.
            </p>

            {reliabilityQuery.data.history.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No eligible supplier deliveries have been recorded yet.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
                <Table className="min-w-[760px]">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Purchase order</TableHeader>
                      <TableHeader>Sent</TableHeader>
                      <TableHeader>Expected by</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader className="text-right">On time</TableHeader>
                      <TableHeader className="text-right">Fulfillment</TableHeader>
                      <TableHeader className="text-right">Damaged</TableHeader>
                      <TableHeader className="text-right">Score</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reliabilityQuery.data.history.map((order) => (
                      <TableRow key={order.purchaseOrderId}>
                        <TableCell className="font-medium text-slate-900">{order.poNumber}</TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(order.sentAt).toLocaleDateString()}</TableCell>
                        <TableCell className="whitespace-nowrap">{order.dueAt ? new Date(order.dueAt).toLocaleDateString() : "Unavailable"}</TableCell>
                        <TableCell><Badge variant={order.status === "COMPLETED" ? "success" : "warning"}>{order.status}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{order.onTimeRate}%</TableCell>
                        <TableCell className="text-right tabular-nums">{order.acceptedUnits} / {order.orderedUnits} ({order.fulfillmentRate}%)</TableCell>
                        <TableCell className="text-right tabular-nums">{order.damagedUnits}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{order.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Supplier Products
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Products supplied by this vendor.
            </p>
          </div>

          <Button
            disabled={!isActive}
            onClick={() => setShowAddProductForm(true)}
          >
            Add Product
          </Button>
        </div>

        {showAddProductForm && (
          <AddVendorProductForm
            vendorId={vendor.id}
            existingProductIds={vendorProducts.map(
              (vendorProduct) => vendorProduct.productId,
            )}
            onCancel={() => setShowAddProductForm(false)}
            onSuccess={() => setShowAddProductForm(false)}
          />
        )}

        {vendorProductsQuery.isLoading && (
          <div className="py-8 text-center text-sm text-slate-500">
            Loading supplier products...
          </div>
        )}

        {vendorProductsQuery.isError && (
          <div className="py-8 text-center text-sm text-red-600">
            Failed to load supplier products.
          </div>
        )}

        {!vendorProductsQuery.isLoading &&
          !vendorProductsQuery.isError &&
          vendorProducts.length === 0 && (
            <div className="mt-5 rounded-md border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm text-slate-500">
                This vendor does not supply any products yet.
              </p>
            </div>
          )}

        {!vendorProductsQuery.isLoading &&
          !vendorProductsQuery.isError &&
          vendorProducts.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Supplier Code</th>
                    <th className="px-3 py-3 font-medium">Price</th>
                    <th className="px-3 py-3 font-medium">Lead Time</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {vendorProducts.map((vendorProduct) => {
                    const product = productMap.get(vendorProduct.productId);

                    return (
                      <tr key={vendorProduct.id}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-950">
                            {product?.name ?? "Unknown product"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {product?.sku ?? vendorProduct.productId}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-slate-700">
                          {vendorProduct.supplierProductCode || "—"}
                        </td>

                        <td className="px-3 py-3 text-slate-700">
                          KES {vendorProduct.currentPrice}
                        </td>

                        <td className="px-3 py-3 text-slate-700">
                          {vendorProduct.leadTimeDays} days
                        </td>

                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              vendorProduct.status === "ACTIVE"
                                ? "success"
                                : "default"
                            }
                          >
                            {vendorProduct.status}
                          </Badge>
                        </td>

                        <td className="px-3 py-3 text-right">
                          <VendorProductActions vendorProduct={vendorProduct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card className="p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Record Information
          </h2>

          <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {new Date(vendor.createdAt).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last Updated
              </p>
              <p className="mt-1 text-sm text-slate-950">
                {new Date(vendor.updatedAt).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Vendor ID
              </p>
              <p className="mt-1 break-all text-sm text-slate-700">
                {vendor.id}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default VendorDetailPage;

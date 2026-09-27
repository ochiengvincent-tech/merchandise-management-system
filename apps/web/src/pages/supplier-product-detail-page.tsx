import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  useDeactivateVendorProduct,
  useReactivateVendorProduct,
  useVendorProduct,
} from "../features/vendor-products/hooks";
import { useVendors } from "../features/vendors/hooks";
import { useProducts } from "../features/products/hooks";

export function SupplierProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const vendorProductQuery = useVendorProduct(id ?? "");
  const vendorsQuery = useVendors({ limit: 100 });
  const productsQuery = useProducts();

  const deactivateMutation = useDeactivateVendorProduct();
  const reactivateMutation = useReactivateVendorProduct();

  const vendorProduct = vendorProductQuery.data;

  const vendor = vendorsQuery.data?.data.find(
    (item) => item.id === vendorProduct?.vendorId,
  );

  const product = productsQuery.data?.find(
    (item) => item.id === vendorProduct?.productId,
  );

  const isLoading =
    vendorProductQuery.isLoading ||
    vendorsQuery.isLoading ||
    productsQuery.isLoading;

  const isUpdatingStatus =
    deactivateMutation.isPending || reactivateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate("/supplier-products")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Supplier Products
          </button>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Supplier Product
          </h1>
        </div>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Loading supplier product...
          </p>
        </Card>
      </div>
    );
  }

  if (vendorProductQuery.isError || !vendorProduct) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate("/supplier-products")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Supplier Products
          </button>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Supplier Product
          </h1>
        </div>

        <Card className="p-6">
          <p className="text-sm text-destructive">
            {vendorProductQuery.error instanceof Error
              ? vendorProductQuery.error.message
              : "Supplier product not found."}
          </p>
        </Card>
      </div>
    );
  }

  const handleStatusChange = async () => {
    const action =
      vendorProduct.status === "ACTIVE" ? "deactivate" : "reactivate";

    const confirmed = window.confirm(
      action === "deactivate"
        ? "Deactivate this supplier product relationship?"
        : "Reactivate this supplier product relationship?",
    );

    if (!confirmed) {
      return;
    }

    if (vendorProduct.status === "ACTIVE") {
      await deactivateMutation.mutateAsync(vendorProduct.id);
      return;
    }

    await reactivateMutation.mutateAsync(vendorProduct.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/supplier-products")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Supplier Products
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {product?.name ?? "Supplier Product"}
            </h1>

            <Badge
              variant={
                vendorProduct.status === "ACTIVE" ? "success" : "default"
              }
            >
              {vendorProduct.status}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {vendorProduct.supplierProductCode ?? "No supplier product code"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              navigate(`/supplier-products/${vendorProduct.id}/edit`)
            }
            disabled={isUpdatingStatus}
          >
            Edit Supplier Product
          </Button>

          <Button
            variant={vendorProduct.status === "ACTIVE" ? "danger" : "primary"}
            onClick={handleStatusChange}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus
              ? "Updating..."
              : vendorProduct.status === "ACTIVE"
                ? "Deactivate"
                : "Reactivate"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Supplier
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Supplier associated with this product.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500">Supplier Name</p>
                <p className="mt-1 font-medium text-slate-950">
                  {vendor?.name ?? "Unknown supplier"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Supplier Code</p>
                <p className="mt-1 font-medium text-slate-950">
                  {vendor?.vendorCode ?? "Unknown code"}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Product
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Inventory product supplied by this supplier.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500">Product Name</p>
                <p className="mt-1 font-medium text-slate-950">
                  {product?.name ?? "Unknown product"}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">SKU</p>
                <p className="mt-1 font-medium text-slate-950">
                  {product?.sku ?? "Unknown SKU"}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Purchasing Terms
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Current commercial terms for this supplier relationship.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Supplier Product Code</p>
              <p className="mt-1 font-medium text-slate-950">
                {vendorProduct.supplierProductCode ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Current Price</p>
              <p className="mt-1 font-medium text-slate-950">
                KES {Number(vendorProduct.currentPrice).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Lead Time</p>
              <p className="mt-1 font-medium text-slate-950">
                {vendorProduct.leadTimeDays} days
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Relationship Details
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              System information for this supplier-product relationship.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Created</p>
              <p className="mt-1 font-medium text-slate-950">
                {new Date(vendorProduct.createdAt).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Last Updated</p>
              <p className="mt-1 font-medium text-slate-950">
                {new Date(vendorProduct.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

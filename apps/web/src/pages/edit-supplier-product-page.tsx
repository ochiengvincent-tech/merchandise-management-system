import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  useUpdateVendorProduct,
  useVendorProduct,
} from "../features/vendor-products/hooks";
import { useVendors } from "../features/vendors/hooks";
import { useProducts } from "../features/products/hooks";
import { getFieldErrorMap } from "../lib/api/client";

export function EditSupplierProductPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const vendorProductQuery = useVendorProduct(id ?? "");
  const vendorsQuery = useVendors({ limit: 100 });
  const productsQuery = useProducts();
  const updateMutation = useUpdateVendorProduct();

  const vendorProduct = vendorProductQuery.data;

  const vendor = vendorsQuery.data?.data.find(
    (item) => item.id === vendorProduct?.vendorId,
  );

  const product = productsQuery.data?.find(
    (item) => item.id === vendorProduct?.productId,
  );

  const [supplierProductCode, setSupplierProductCode] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [initializedId, setInitializedId] = useState("");

  if (vendorProduct && initializedId !== vendorProduct.id) {
    setInitializedId(vendorProduct.id);
    setSupplierProductCode(vendorProduct.supplierProductCode ?? "");
    setCurrentPrice(vendorProduct.currentPrice);
    setLeadTimeDays(String(vendorProduct.leadTimeDays));
  }

  const fieldErrors = getFieldErrorMap(updateMutation.error);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!id) {
      return;
    }

    const price = Number(currentPrice);
    const leadTime = Number(leadTimeDays);

    if (!Number.isFinite(price) || price < 0) {
      return;
    }

    if (!Number.isInteger(leadTime) || leadTime < 0) {
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          supplierProductCode: supplierProductCode.trim() || undefined,
          currentPrice: price,
          leadTimeDays: leadTime,
        },
      });

      navigate(`/supplier-products/${id}`);
    } catch {
      return;
    }
  };

  const isLoading =
    vendorProductQuery.isLoading ||
    vendorsQuery.isLoading ||
    productsQuery.isLoading;

  const loadError =
    vendorProductQuery.error || vendorsQuery.error || productsQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() =>
              navigate(id ? `/supplier-products/${id}` : "/supplier-products")
            }
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Supplier Product
          </button>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Edit Supplier Product
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

  if (loadError || !vendorProduct) {
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
            Edit Supplier Product
          </h1>
        </div>

        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {loadError instanceof Error
              ? loadError.message
              : "Supplier product not found."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/supplier-products/${vendorProduct.id}`)}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Supplier Product
        </button>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Edit Supplier Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Update the purchasing terms for this supplier-product relationship.
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Supplier Relationship
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Supplier and product are fixed for this relationship.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Supplier</p>
              <p className="mt-1 font-medium text-slate-950">
                {vendor?.name ?? "Unknown supplier"}
              </p>
              <p className="text-sm text-slate-500">
                {vendor?.vendorCode ?? "Unknown code"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Product</p>
              <p className="mt-1 font-medium text-slate-950">
                {product?.name ?? "Unknown product"}
              </p>
              <p className="text-sm text-slate-500">
                {product?.sku ?? "Unknown SKU"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Purchasing Terms
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Update the supplier-specific code, current price, and lead time.
              </p>
            </div>

            <div>
              <label
                htmlFor="supplier-product-code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Supplier Product Code
              </label>

              <Input
                id="supplier-product-code"
                value={supplierProductCode}
                onChange={(event) => setSupplierProductCode(event.target.value)}
                placeholder="Optional supplier-specific code"
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.supplierProductCode)}
              />

              {fieldErrors.supplierProductCode && (
                <p className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.supplierProductCode}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="current-price"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Current Price (KES) <span className="text-red-600">*</span>
                </label>

                <Input
                  id="current-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentPrice}
                  onChange={(event) => setCurrentPrice(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.currentPrice)}
                />

                {fieldErrors.currentPrice && (
                  <p className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.currentPrice}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="lead-time"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Lead Time (days) <span className="text-red-600">*</span>
                </label>

                <Input
                  id="lead-time"
                  type="number"
                  min="0"
                  step="1"
                  value={leadTimeDays}
                  onChange={(event) => setLeadTimeDays(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.leadTimeDays)}
                />

                {fieldErrors.leadTimeDays && (
                  <p className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.leadTimeDays}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {updateMutation.isError && Object.keys(fieldErrors).length === 0 && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : "Unable to update supplier product."}
            </p>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/supplier-products/${vendorProduct.id}`)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

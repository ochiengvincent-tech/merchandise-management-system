import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useProducts } from "../features/products/hooks";
import { useCreateVendorProduct } from "../features/vendor-products/hooks";
import { useVendors } from "../features/vendors/hooks";
import { getFieldErrorMap } from "../lib/api/client";

export function NewSupplierProductPage() {
  const navigate = useNavigate();
  const createMutation = useCreateVendorProduct();

  const vendorsQuery = useVendors({
    status: "ACTIVE",
    limit: 100,
  });

  const productsQuery = useProducts({
    status: "ACTIVE",
  });

  const [form, setForm] = useState({
    vendorId: "",
    productId: "",
    supplierProductCode: "",
    currentPrice: "",
    leadTimeDays: "",
  });

  const fieldErrors = getFieldErrorMap(createMutation.error);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.vendorId || !form.productId) {
      return;
    }

    const currentPrice = Number(form.currentPrice);
    const leadTimeDays = Number(form.leadTimeDays);

    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      return;
    }

    if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
      return;
    }

    try {
      await createMutation.mutateAsync({
        vendorId: form.vendorId,
        data: {
          productId: form.productId,
          supplierProductCode: form.supplierProductCode.trim() || undefined,
          currentPrice,
          leadTimeDays,
        },
      });

      navigate("/supplier-products");
    } catch {
      return;
    }
  };

  const vendors = vendorsQuery.data?.data ?? [];
  const products = productsQuery.data ?? [];

  const isLoading = vendorsQuery.isLoading || productsQuery.isLoading;

  const loadError = vendorsQuery.error || productsQuery.error;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/supplier-products")}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Supplier Products
        </button>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Add Supplier Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Associate a product with a supplier and define its purchasing terms.
        </p>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Failed to load suppliers or products.
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Supplier relationship
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Select an active supplier and the inventory product they supply.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="vendor"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Supplier <span className="text-red-600">*</span>
                </label>

                <Select
                  id="vendor"
                  value={form.vendorId}
                  onChange={(event) =>
                    updateField("vendorId", event.target.value)
                  }
                  required
                  disabled={isLoading || Boolean(loadError)}
                  aria-invalid={Boolean(fieldErrors.vendorId)}
                >
                  <option value="">Select supplier</option>

                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name} ({vendor.vendorCode})
                    </option>
                  ))}
                </Select>

                {fieldErrors.vendorId && (
                  <p className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.vendorId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="product"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Product <span className="text-red-600">*</span>
                </label>

                <Select
                  id="product"
                  value={form.productId}
                  onChange={(event) =>
                    updateField("productId", event.target.value)
                  }
                  required
                  disabled={isLoading || Boolean(loadError)}
                  aria-invalid={Boolean(fieldErrors.productId)}
                >
                  <option value="">Select product</option>

                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </Select>

                {fieldErrors.productId && (
                  <p className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.productId}
                  </p>
                )}
              </div>
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
                value={form.supplierProductCode}
                onChange={(event) =>
                  updateField("supplierProductCode", event.target.value)
                }
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
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Purchasing terms
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Define the current supplier price and expected lead time.
              </p>
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
                  value={form.currentPrice}
                  onChange={(event) =>
                    updateField("currentPrice", event.target.value)
                  }
                  placeholder="0.00"
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
                  value={form.leadTimeDays}
                  onChange={(event) =>
                    updateField("leadTimeDays", event.target.value)
                  }
                  placeholder="0"
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

        {createMutation.isError && Object.keys(fieldErrors).length === 0 && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Unable to add supplier product."}
            </p>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/supplier-products")}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={
              createMutation.isPending || isLoading || Boolean(loadError)
            }
          >
            {createMutation.isPending ? "Adding..." : "Add Supplier Product"}
          </Button>
        </div>
      </form>
    </div>
  );
}

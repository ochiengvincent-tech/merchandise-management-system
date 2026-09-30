import { type FormEvent, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { getFieldErrorMap } from "../../lib/api/client";
import { useProducts } from "../products/hooks";
import { useCreateVendorProduct } from "./hooks";

type AddVendorProductFormProps = {
  vendorId: string;
  existingProductIds: string[];
  onCancel: () => void;
  onSuccess: () => void;
};

export function AddVendorProductForm({
  vendorId,
  existingProductIds,
  onCancel,
  onSuccess,
}: AddVendorProductFormProps) {
  const [productId, setProductId] = useState("");
  const [supplierProductCode, setSupplierProductCode] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");

  const productsQuery = useProducts({ status: "ACTIVE" });
  const createMutation = useCreateVendorProduct();

  const availableProducts = (productsQuery.data ?? []).filter(
    (product) => !existingProductIds.includes(product.id),
  );

  const fieldErrors = getFieldErrorMap(createMutation.error);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await createMutation.mutateAsync({
        vendorId,
        data: {
          productId,
          supplierProductCode: supplierProductCode.trim() || undefined,
          currentPrice: Number(currentPrice),
          leadTimeDays: Number(leadTimeDays),
        },
      });

      onSuccess();
    } catch {
      // The mutation state renders field and form level errors.
    }
  };

  return (
    <Card className="mt-5">
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            Add Supplier Product
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Add a product this vendor supplies and record the current commercial
            terms.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="supplier-product"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Product
            </label>

            <SearchableSelect
              id="supplier-product"
              value={productId}
              onChange={setProductId}
              options={availableProducts.map((product) => ({
                value: product.id,
                label: `${product.sku} · ${product.name}`,
              }))}
              placeholder={
                productsQuery.isLoading ? "Loading products…" : "Search products…"
              }
              emptyMessage="No available matching products"
              required
              disabled={productsQuery.isLoading || availableProducts.length === 0}
              aria-invalid={Boolean(fieldErrors.productId)}
            />

            {fieldErrors.productId && (
              <p className="mt-1.5 text-sm text-red-600">
                {fieldErrors.productId}
              </p>
            )}
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
              placeholder="Optional supplier SKU"
              aria-invalid={Boolean(fieldErrors.supplierProductCode)}
            />

            {fieldErrors.supplierProductCode && (
              <p className="mt-1.5 text-sm text-red-600">
                {fieldErrors.supplierProductCode}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="current-price"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Current Price
            </label>

            <Input
              id="current-price"
              type="number"
              min="0"
              step="0.01"
              value={currentPrice}
              onChange={(event) => setCurrentPrice(event.target.value)}
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
              htmlFor="lead-time-days"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Lead Time
            </label>

            <Input
              id="lead-time-days"
              type="number"
              min="0"
              step="1"
              value={leadTimeDays}
              onChange={(event) => setLeadTimeDays(event.target.value)}
              placeholder="Days"
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

        {createMutation.isError && Object.keys(fieldErrors).length === 0 && (
          <p className="text-sm text-red-600">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Failed to add supplier product."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={
              createMutation.isPending ||
              productsQuery.isLoading ||
              availableProducts.length === 0
            }
          >
            {createMutation.isPending ? "Adding..." : "Add product"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

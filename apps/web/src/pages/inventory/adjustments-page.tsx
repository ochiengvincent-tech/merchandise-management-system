import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { useLocations } from "../../features/locations/hooks";
import { useProducts } from "../../features/products/hooks";
import { useCreateAdjustment, useStockByProduct } from "../../features/inventory/hooks";
import { getFieldErrorMap } from "../../lib/api/client";
import { CURRENT_ACTOR_ID } from "../../lib/api/config";

export function AdjustmentsPage() {
  const productsQuery = useProducts({ status: "ACTIVE" });
  const locationsQuery = useLocations({ status: "ACTIVE" });
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const stockQuery = useStockByProduct(productId);
  const mutation = useCreateAdjustment();

  const products = productsQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const stockRecords = stockQuery.data ?? [];
  const selectedStock = stockRecords.find((stock) => stock.locationId === locationId);
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const fieldErrors = { ...getFieldErrorMap(mutation.error), ...localErrors };

  const resetFeedback = () => {
    setLocalErrors({});
    setSuccessMessage("");
    mutation.reset();
  };

  const handleProductChange = (value: string) => {
    resetFeedback();
    setProductId(value);
    setLocationId("");
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!productId) errors.productId = "Select a product.";
    if (!locationId) errors.locationId = "Select a location.";
    if (!quantityChange.trim()) {
      errors.quantityChange = "Enter a quantity to add or remove.";
    } else {
      const quantity = Number(quantityChange);
      if (!Number.isInteger(quantity) || quantity === 0) {
        errors.quantityChange = "Enter a non-zero whole number. Use a negative number to remove stock.";
      } else if (selectedStock) {
        const minimumChange = Math.max(
          -selectedStock.quantityOnHand,
          selectedStock.quantityAllocated - selectedStock.quantityOnHand,
        );
        if (quantity < minimumChange) {
          errors.quantityChange = `The smallest allowed adjustment is ${minimumChange}; ${selectedStock.quantityAllocated} units are allocated.`;
        }
      }
    }
    if (!reason.trim()) errors.reason = "Enter a reason for this adjustment.";
    if (reason.trim().length > 255) errors.reason = "Reason must be 255 characters or fewer.";
    if (reference.trim().length > 100) errors.reference = "Reference must be 100 characters or fewer.";
    if (productId && locationId && !stockQuery.isLoading && !selectedStock) {
      errors.stock = "No stock record exists for this product at the selected location.";
    }
    return errors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage("");
    const errors = validate();
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const result = await mutation.mutateAsync({
        productId,
        locationId,
        quantityChange: Number(quantityChange),
        reason: reason.trim(),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        createdBy: CURRENT_ACTOR_ID,
      });
      setSuccessMessage(
        `Adjustment recorded. On-hand stock is now ${result.stock.quantityOnHand}.`,
      );
      setQuantityChange("");
      setReason("");
      setReference("");
      setLocalErrors({});
    } catch {
      // Mutation errors are shown inline through the shared API error contract.
    }
  };

  const isLoading = productsQuery.isLoading || locationsQuery.isLoading;
  const isSubmitting = mutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Stock adjustments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Record a stock increase or decrease and keep the reason in the inventory audit trail.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {(productsQuery.isError || locationsQuery.isError) && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Could not load products or locations. Refresh the page and try again.
            </p>
          )}
          {mutation.error instanceof Error && Object.keys(getFieldErrorMap(mutation.error)).length === 0 && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{mutation.error.message}</p>
          )}
          {successMessage && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{successMessage}</p>}
          {isLoading && <p role="status" className="text-sm text-slate-500">Loading products and locations…</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="adjustment-product" className="mb-1.5 block text-sm font-medium text-slate-700">Product</label>
              <SearchableSelect
                id="adjustment-product"
                value={productId}
                onChange={handleProductChange}
                options={products.map((item) => ({
                  value: item.id,
                  label: `${item.sku} · ${item.name}`,
                }))}
                placeholder="Search active products…"
                emptyMessage="No matching active products"
                required
                disabled={productsQuery.isLoading || isSubmitting}
                aria-invalid={Boolean(fieldErrors.productId)}
              />
              {fieldErrors.productId && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.productId}</p>}
            </div>

            <div>
              <label htmlFor="adjustment-location" className="mb-1.5 block text-sm font-medium text-slate-700">Location</label>
              <Select id="adjustment-location" value={locationId} disabled={!productId || stockQuery.isLoading || locationsQuery.isLoading || isSubmitting} onChange={(event) => { resetFeedback(); setLocationId(event.target.value); }} aria-invalid={Boolean(fieldErrors.locationId || fieldErrors.stock)}>
                <option value="">{!productId ? "Select a product first" : "Select a location with stock"}</option>
                {stockRecords.map((stock) => {
                  const location = locationById.get(stock.locationId);
                  if (!location || location.status !== "ACTIVE") return null;
                  return <option key={stock.locationId} value={stock.locationId}>{location.locationCode} · {location.name}</option>;
                })}
              </Select>
              {fieldErrors.locationId && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.locationId}</p>}
              {fieldErrors.stock && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.stock}</p>}
              {productId && !stockQuery.isLoading && stockRecords.length === 0 && !stockQuery.isError && <p className="mt-1 text-sm text-amber-800">This product has no stock records to adjust.</p>}
              {stockQuery.isError && <p role="alert" className="mt-1 text-sm text-red-600">Unable to load this product’s stock records.</p>}
            </div>
          </div>

          {selectedStock && (
            <div className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-3">
              <Quantity label="On hand" value={selectedStock.quantityOnHand} />
              <Quantity label="Allocated" value={selectedStock.quantityAllocated} />
              <Quantity label="Available" value={selectedStock.quantityAvailable} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="adjustment-quantity" className="mb-1.5 block text-sm font-medium text-slate-700">Quantity change</label>
              <Input id="adjustment-quantity" type="number" step="1" value={quantityChange} disabled={isSubmitting} onChange={(event) => { resetFeedback(); setQuantityChange(event.target.value); }} aria-invalid={Boolean(fieldErrors.quantityChange)} placeholder="e.g. 12 or -3" />
              <p className="mt-1 text-xs text-slate-500">Use a positive number to add stock and a negative number to remove stock.</p>
              {fieldErrors.quantityChange && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.quantityChange}</p>}
            </div>

            <div>
              <label htmlFor="adjustment-reference" className="mb-1.5 block text-sm font-medium text-slate-700">Reference <span className="font-normal text-slate-500">(optional)</span></label>
              <Input id="adjustment-reference" value={reference} maxLength={100} disabled={isSubmitting} onChange={(event) => { resetFeedback(); setReference(event.target.value); }} aria-invalid={Boolean(fieldErrors.reference)} placeholder="e.g. Stock count 2026-09" />
              {fieldErrors.reference && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.reference}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="adjustment-reason" className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label>
            <textarea id="adjustment-reason" value={reason} maxLength={255} rows={3} disabled={isSubmitting} onChange={(event) => { resetFeedback(); setReason(event.target.value); }} aria-invalid={Boolean(fieldErrors.reason)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Explain why the on-hand quantity needs to change" />
            {fieldErrors.reason && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.reason}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isLoading || isSubmitting || stockQuery.isLoading || stockQuery.isError}>{isSubmitting ? "Saving adjustment…" : "Save adjustment"}</Button>
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => { setProductId(""); setLocationId(""); setQuantityChange(""); setReason(""); setReference(""); setSuccessMessage(""); setLocalErrors({}); mutation.reset(); }}>Clear form</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Quantity({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

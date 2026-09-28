import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { getLocations } from "../locations/api";
import { getVendors } from "../vendors/api";
import { getVendorProducts } from "../vendor-products/api";
import { getFieldErrorMap } from "../../lib/api/client";
import type { PurchaseOrder } from "./types";
import {
  usePurchaseOrderReferences,
  useUpdatePurchaseOrder,
} from "./hooks";

type EditableLine = {
  productId: string;
  quantityOrdered: string;
};

type DraftForm = {
  poNumber: string;
  vendorId: string;
  destinationLocationId: string;
  requestedDeliveryDate: string;
  notes: string;
  lines: EditableLine[];
};

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  unitPrice: string;
  retainedOnly: boolean;
};

const formatCurrency = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function initialForm(purchaseOrder: PurchaseOrder & {
  lines: Array<{ productId: string; quantityOrdered: number }>;
}): DraftForm {
  return {
    poNumber: purchaseOrder.poNumber,
    vendorId: purchaseOrder.vendorId,
    destinationLocationId: purchaseOrder.destinationLocationId,
    requestedDeliveryDate: purchaseOrder.requestedDeliveryDate ?? "",
    notes: purchaseOrder.notes ?? "",
    lines: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantityOrdered: String(line.quantityOrdered),
    })),
  };
}

type EditDraftPurchaseOrderProps = {
  purchaseOrder: PurchaseOrder & {
    lines: Array<{
      productId: string;
      quantityOrdered: number;
      unitPrice: string;
    }>;
  };
};

export function EditDraftPurchaseOrder({
  purchaseOrder,
}: EditDraftPurchaseOrderProps) {
  const [editing, setEditing] = useState(purchaseOrder.revisionRequired);
  const [saved, setSaved] = useState(false);


  if (purchaseOrder.status !== "DRAFT") return null;

  return (
    <Card className="p-5">
      {!editing ? (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Draft details
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {purchaseOrder.revisionRequired
                ? "This PO was rejected. Review the order and update it before resubmitting for approval."
                : "Edit the order information and quantities before submitting it for approval."}
            </p>
            {saved && (
              <p className="mt-2 text-sm text-green-700" role="status">
                Draft purchase order updated.
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            Edit draft
          </Button>
        </div>
      ) : (
        <DraftPurchaseOrderForm
          key={`${purchaseOrder.id}-${purchaseOrder.updatedAt}`}
          purchaseOrder={purchaseOrder}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
        />
      )}
    </Card>
  );
}

type DraftPurchaseOrderFormProps = EditDraftPurchaseOrderProps & {
  onCancel: () => void;
  onSaved: () => void;
};

function DraftPurchaseOrderForm({
  purchaseOrder,
  onCancel,
  onSaved,
}: DraftPurchaseOrderFormProps) {
  const mutation = useUpdatePurchaseOrder();
  const [form, setForm] = useState(() => initialForm(purchaseOrder));
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "active"],
    queryFn: () => getVendors({ status: "ACTIVE", limit: 100 }),
  });
  const locationsQuery = useQuery({
    queryKey: ["locations", "active"],
    queryFn: () => getLocations({ status: "ACTIVE" }),
  });
  const originalVendorReference = usePurchaseOrderReferences(
    [purchaseOrder.vendorId],
    [],
    [],
  );
  const vendorProductsQuery = useQuery({
    queryKey: ["vendor-products", form.vendorId],
    queryFn: () => getVendorProducts(form.vendorId),
    enabled: Boolean(form.vendorId),
  });

  const vendorProducts = useMemo(
    () => (vendorProductsQuery.data ?? []).filter((item) => item.status === "ACTIVE"),
    [vendorProductsQuery.data],
  );
  const productIds = useMemo(() => {
    const ids = vendorProducts.map((item) => item.productId);
    if (form.vendorId === purchaseOrder.vendorId) {
      ids.push(...purchaseOrder.lines.map((line) => line.productId));
    }
    return [...new Set(ids)];
  }, [form.vendorId, purchaseOrder, vendorProducts]);
  const productReferences = usePurchaseOrderReferences([], [], productIds);

  const productOptions = useMemo(() => {
    const options = new Map<string, ProductOption>();
    for (const vendorProduct of vendorProducts) {
      const product = productReferences.products.get(vendorProduct.productId);
      if (product) {
        options.set(product.id, {
          id: product.id,
          sku: product.sku,
          name: product.name,
          unitOfMeasure: product.unitOfMeasure,
          unitPrice: vendorProduct.currentPrice,
          retainedOnly: false,
        });
      }
    }

    if (form.vendorId === purchaseOrder.vendorId) {
      for (const line of purchaseOrder.lines) {
        if (options.has(line.productId)) continue;
        const product = productReferences.products.get(line.productId);
        if (product) {
          options.set(product.id, {
            id: product.id,
            sku: product.sku,
            name: product.name,
            unitOfMeasure: product.unitOfMeasure,
            unitPrice: line.unitPrice,
            retainedOnly: true,
          });
        }
      }
    }

    return [...options.values()];
  }, [form.vendorId, productReferences.products, purchaseOrder, vendorProducts]);

  const activeProductOptions = productOptions.filter((option) => !option.retainedOnly);
  const vendorList = vendorsQuery.data?.data ?? [];
  const originalVendor = originalVendorReference.vendors.get(purchaseOrder.vendorId);
  const vendors = originalVendor && !vendorList.some((item) => item.id === originalVendor.id)
    ? [...vendorList, originalVendor]
    : vendorList;
  const locations = locationsQuery.data ?? [];
  const locationsLoading = locationsQuery.isLoading || originalVendorReference.isLoading;
  const productListLoading = vendorProductsQuery.isLoading || productReferences.isLoading;
  const apiFieldErrors = getFieldErrorMap(mutation.error);
  const fieldErrors = { ...apiFieldErrors, ...validationErrors };
  const minDate = purchaseOrder.createdAt.slice(0, 10);

  const clearErrors = () => {
    setValidationErrors({});
    setFormError("");
    mutation.reset();
  };

  const updateField = (field: keyof Omit<DraftForm, "lines">, value: string) => {
    clearErrors();
    setForm((current) => ({ ...current, [field]: value }));
  };

  const changeVendor = (vendorId: string) => {
    clearErrors();
    setForm((current) => ({
      ...current,
      vendorId,
      lines: [{ productId: "", quantityOrdered: "1" }],
    }));
  };

  const updateLine = (index: number, field: keyof EditableLine, value: string) => {
    clearErrors();
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.poNumber.trim()) errors.poNumber = "Enter a PO number.";
    if (!form.vendorId) errors.vendorId = "Select a vendor.";
    if (!form.destinationLocationId) {
      errors.destinationLocationId = "Select a destination.";
    }
    if (form.requestedDeliveryDate && form.requestedDeliveryDate < minDate) {
      errors.requestedDeliveryDate =
        "Requested delivery must be on or after the PO creation date.";
    }
    if (form.vendorId && !productListLoading && activeProductOptions.length === 0) {
      errors.supplierProducts = vendorProductsQuery.isError || productReferences.isError
        ? "Could not load supplier products. Try again before saving."
        : "This vendor has no active supplier products.";
    }
    const seen = new Set<string>();
    if (form.vendorId && activeProductOptions.length > 0) {
      form.lines.forEach((line, index) => {
        if (!line.productId) {
          errors[`lines.${index}.productId`] = "Select a product.";
        }
        const quantity = Number(line.quantityOrdered);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          errors[`lines.${index}.quantityOrdered`] =
            "Enter a positive whole-number quantity.";
        }
        if (line.productId && seen.has(line.productId)) {
          errors[`lines.${index}.productId`] =
            "A product can only appear once in an order.";
        }
        if (line.productId) seen.add(line.productId);
      });
    }
    return errors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate();
    setValidationErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    try {
      await mutation.mutateAsync({
        id: purchaseOrder.id,
        data: {
          poNumber: form.poNumber.trim(),
          vendorId: form.vendorId,
          destinationLocationId: form.destinationLocationId,
          requestedDeliveryDate: form.requestedDeliveryDate || null,
          notes: form.notes,
          lines: form.lines.map((line) => ({
            productId: line.productId,
            quantityOrdered: Number(line.quantityOrdered),
          })),
        },
      });
      onSaved();
    } catch (error) {
      const apiErrors = getFieldErrorMap(error);
      if (Object.keys(apiErrors).length === 0 && error instanceof Error) {
        setFormError(error.message);
      }
    }
  };

  const isLoading = locationsLoading || vendorsQuery.isLoading || productListLoading;
  const isSubmitting = mutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Edit draft purchase order</h2>
          <p className="mt-1 text-sm text-slate-500">
            {purchaseOrder.revisionRequired
              ? "This PO was rejected. Update the order to address the rejection, then save the revision before resubmitting."
              : "Changes are allowed while the PO is a draft. Changing the vendor resets its lines."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting ? (purchaseOrder.revisionRequired ? "Saving revision..." : "Saving...") : (purchaseOrder.revisionRequired ? "Save revision" : "Save changes")}
          </Button>
        </div>
      </div>

      {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      {isLoading && <p role="status" className="text-sm text-slate-500">Loading vendors, destinations, and supplier products…</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="draft-po-number" className="mb-1.5 block text-sm font-medium text-slate-700">PO Number</label>
          <Input id="draft-po-number" value={form.poNumber} maxLength={50} disabled={isSubmitting} onChange={(event) => updateField("poNumber", event.target.value)} aria-invalid={Boolean(fieldErrors.poNumber)} />
          {fieldErrors.poNumber && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.poNumber}</p>}
        </div>
        <div>
          <label htmlFor="draft-vendor" className="mb-1.5 block text-sm font-medium text-slate-700">Vendor</label>
          <SearchableSelect
            id="draft-vendor"
            value={form.vendorId}
            disabled={vendorsQuery.isLoading || isSubmitting}
            onChange={changeVendor}
            options={vendors.map((vendor) => ({
              value: vendor.id,
              label: `${vendor.vendorCode} · ${vendor.name}${vendor.status === "INACTIVE" ? " (inactive)" : ""}`,
            }))}
            placeholder="Search vendors…"
            emptyMessage="No matching vendors"
            required
            aria-invalid={Boolean(fieldErrors.vendorId)}
          />
          {fieldErrors.vendorId && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.vendorId}</p>}
        </div>
        <div>
          <label htmlFor="draft-destination" className="mb-1.5 block text-sm font-medium text-slate-700">Destination</label>
          <Select id="draft-destination" value={form.destinationLocationId} disabled={locationsQuery.isLoading || isSubmitting} onChange={(event) => updateField("destinationLocationId", event.target.value)} aria-invalid={Boolean(fieldErrors.destinationLocationId)}>
            <option value="">Select destination</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.locationCode} · {location.name}</option>)}
          </Select>
          {fieldErrors.destinationLocationId && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.destinationLocationId}</p>}
        </div>
        <div>
          <label htmlFor="draft-delivery-date" className="mb-1.5 block text-sm font-medium text-slate-700">Requested delivery date</label>
          <Input id="draft-delivery-date" type="date" min={minDate} value={form.requestedDeliveryDate} disabled={isSubmitting} onChange={(event) => updateField("requestedDeliveryDate", event.target.value)} aria-invalid={Boolean(fieldErrors.requestedDeliveryDate)} />
          {fieldErrors.requestedDeliveryDate && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.requestedDeliveryDate}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
          <Input value={purchaseOrder.currency} disabled aria-label="Currency (fixed)" />
          <p className="mt-1 text-xs text-slate-500">Currency is fixed to KES under the current pricing and submission policy.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment terms</label>
          <Input value={purchaseOrder.paymentTerms} disabled aria-label="Payment terms (from vendor)" />
          <p className="mt-1 text-xs text-slate-500">Payment terms come from the selected vendor.</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Order lines</h3>
            <p className="mt-1 text-xs text-slate-500">Existing prices stay fixed; new products use the vendor’s current price.</p>
          </div>
          <Button type="button" variant="secondary" disabled={isSubmitting || productListLoading || activeProductOptions.length === 0 || form.lines.length >= activeProductOptions.length} onClick={() => { clearErrors(); setForm((current) => ({ ...current, lines: [...current.lines, { productId: "", quantityOrdered: "1" }] })); }}>
            Add line
          </Button>
        </div>

        {(vendorProductsQuery.isError || productReferences.isError) && <p role="alert" className="text-sm text-red-700">Could not load the product list for this vendor.</p>}
        {fieldErrors.supplierProducts && <p role="alert" className="text-sm text-red-700">{fieldErrors.supplierProducts}</p>}
        {fieldErrors.lines && <p role="alert" className="text-sm text-red-700">{fieldErrors.lines}</p>}

        {form.lines.map((line, index) => {
          const selectedProduct = productOptions.find((option) => option.id === line.productId);
          const vendorProduct = vendorProducts.find((option) => option.productId === line.productId);
          const originalLine = purchaseOrder.lines.find((option) => option.productId === line.productId);
          const unitPrice = form.vendorId === purchaseOrder.vendorId && originalLine
            ? originalLine.unitPrice
            : vendorProduct?.currentPrice ?? selectedProduct?.unitPrice ?? "0";
          const quantity = Number(line.quantityOrdered);
          const lineTotal = Number.isInteger(quantity) && quantity > 0
            ? quantity * Number(unitPrice)
            : 0;

          return (
            <div key={index} className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_auto] sm:items-end">
              <div>
                <label htmlFor={`draft-product-${index}`} className="mb-1.5 block text-sm font-medium text-slate-700">Product</label>
                <SearchableSelect
                  id={`draft-product-${index}`}
                  value={line.productId}
                  disabled={productListLoading || isSubmitting}
                  onChange={(productId) => updateLine(index, "productId", productId)}
                  options={productOptions.map((option) => ({
                    value: option.id,
                    label: `${option.sku} · ${option.name}${option.retainedOnly ? " (existing line)" : ""}`,
                    disabled: form.lines.some(
                      (other, otherIndex) =>
                        otherIndex !== index && other.productId === option.id,
                    ),
                  }))}
                  placeholder="Search vendor products…"
                  emptyMessage="No matching vendor products"
                  required
                  aria-invalid={Boolean(fieldErrors[`lines.${index}.productId`])}
                />
                {fieldErrors[`lines.${index}.productId`] && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors[`lines.${index}.productId`]}</p>}
              </div>
              <div>
                <label htmlFor={`draft-quantity-${index}`} className="mb-1.5 block text-sm font-medium text-slate-700">Quantity</label>
                <Input id={`draft-quantity-${index}`} type="number" min="1" step="1" value={line.quantityOrdered} disabled={isSubmitting} onChange={(event) => updateLine(index, "quantityOrdered", event.target.value)} aria-invalid={Boolean(fieldErrors[`lines.${index}.quantityOrdered`])} />
                {fieldErrors[`lines.${index}.quantityOrdered`] && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors[`lines.${index}.quantityOrdered`]}</p>}
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Unit price / line total</p>
                <p className="text-sm text-slate-700">{formatCurrency(Number(unitPrice), purchaseOrder.currency)} / {formatCurrency(lineTotal, purchaseOrder.currency)}</p>
              </div>
              <Button type="button" variant="secondary" disabled={isSubmitting || form.lines.length <= 1} onClick={() => { clearErrors(); setForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) })); }}>
                Remove
              </Button>
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor="draft-notes" className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
        <textarea id="draft-notes" value={form.notes} maxLength={2000} rows={3} disabled={isSubmitting} onChange={(event) => updateField("notes", event.target.value)} aria-invalid={Boolean(fieldErrors.notes)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        {fieldErrors.notes && <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.notes}</p>}
      </div>
    </form>
  );
}

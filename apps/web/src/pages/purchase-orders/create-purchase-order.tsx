import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSmartBack } from "../../hooks/use-smart-back";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Select } from "../../components/ui/select";
import { useLocations } from "../../features/locations/hooks";
import { useProducts } from "../../features/products/hooks";
import {
  useCreatePurchaseOrder,
  usePurchaseOrderPolicy,
  useConvertReorderSuggestion,
} from "../../features/purchase-orders/hooks";
import { useVendorProducts } from "../../features/vendor-products/hooks";
import { useVendors } from "../../features/vendors/hooks";
import { getFieldErrorMap } from "../../lib/api/client";

type OrderLineForm = {
  productId: string;
  quantityOrdered: string;
};

const createEmptyLine = (): OrderLineForm => ({
  productId: "",
  quantityOrdered: "1",
});

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatErrorField(field: string) {
  const lineMatch = field.match(/^lines\.(\d+)\.(.+)$/);
  if (lineMatch) {
    const lineNumber = Number(lineMatch[1]) + 1;
    const fieldName =
      lineMatch[2] === "productId"
        ? "product"
        : lineMatch[2] === "quantityOrdered"
          ? "quantity"
          : lineMatch[2];

    return `Line ${lineNumber} ${fieldName}`;
  }

  const labels: Record<string, string> = {
    poNumber: "PO number",
    vendorId: "Vendor",
    destinationLocationId: "Destination",
    requestedDeliveryDate: "Requested delivery date",
    currency: "Currency",
    lines: "Order lines",
    createdBy: "Creator",
  };

  return labels[field] ?? field;
}

function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reorderSuggestionId = searchParams.get("reorderSuggestionId");
  const goBack = useSmartBack("/purchase-orders");
  const createMutation = useCreatePurchaseOrder();
  const policyQuery = usePurchaseOrderPolicy();
  const convertSuggestion = useConvertReorderSuggestion();

  const [poNumber, setPoNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState(searchParams.get("locationId") ?? "");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineForm[]>([
    searchParams.get("productId")
      ? { productId: searchParams.get("productId")!, quantityOrdered: searchParams.get("quantity") ?? "1" }
      : createEmptyLine(),
  ]);
  const [formError, setFormError] = useState("");
  const [createdDraftId, setCreatedDraftId] = useState("");

  const vendorsQuery = useVendors({ status: "ACTIVE", limit: 100 });
  const locationsQuery = useLocations({ status: "ACTIVE" });
  const productsQuery = useProducts({ status: "ACTIVE" });
  const vendorProductsQuery = useVendorProducts(vendorId);
  const earliestRequestedDeliveryDate = new Date().toISOString().slice(0, 10);

  const vendors = vendorsQuery.data?.data ?? [];
  const locations = locationsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const activeVendorProducts = (vendorProductsQuery.data ?? []).filter(
    (vendorProduct) => vendorProduct.status === "ACTIVE",
  );
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const availableVendorProducts = activeVendorProducts.filter((vendorProduct) =>
    productsById.has(vendorProduct.productId),
  );
  const vendorProductsByProductId = new Map(
    availableVendorProducts.map((vendorProduct) => [
      vendorProduct.productId,
      vendorProduct,
    ]),
  );
  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);

  const isLoading =
    vendorsQuery.isLoading ||
    locationsQuery.isLoading ||
    productsQuery.isLoading ||
    (Boolean(vendorId) && vendorProductsQuery.isLoading);
  const loadError =
    vendorsQuery.error ??
    locationsQuery.error ??
    productsQuery.error ??
    (vendorProductsQuery.isError ? vendorProductsQuery.error : null);
  const fieldErrors = getFieldErrorMap(createMutation.error);

  const estimatedTotalCents = lines.reduce((total, line) => {
    const quantity = Number(line.quantityOrdered);
    const vendorProduct = vendorProductsByProductId.get(line.productId);
    const price = Number(vendorProduct?.currentPrice);

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price)
    ) {
      return total;
    }

    return total + quantity * Math.round(price * 100);
  }, 0);
  const maxPoValueCents = policyQuery.data
    ? Math.round(Number(policyQuery.data.data.maxPoValueKes) * 100)
    : null;
  const exceedsLimit =
    maxPoValueCents !== null && estimatedTotalCents > maxPoValueCents;

  const clearSubmissionErrors = () => {
    setFormError("");
    if (createMutation.isError) {
      createMutation.reset();
    }
  };

  const updateLine = (
    index: number,
    field: keyof OrderLineForm,
    value: string,
  ) => {
    clearSubmissionErrors();
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    );
  };

  const handleVendorChange = (nextVendorId: string) => {
    clearSubmissionErrors();
    setVendorId(nextVendorId);
    setLines(reorderSuggestionId && searchParams.get("productId")
      ? [{ productId: searchParams.get("productId")!, quantityOrdered: searchParams.get("quantity") ?? "1" }]
      : [createEmptyLine()]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const productIds = lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      setFormError("Each product can only appear once on a purchase order.");
      return;
    }

    const invalidQuantity = lines.some((line) => {
      const quantity = Number(line.quantityOrdered);
      return !Number.isInteger(quantity) || quantity <= 0;
    });
    if (invalidQuantity) {
      setFormError("Enter a positive whole-number quantity for every line.");
      return;
    }

    if (!selectedVendor?.paymentTerms) {
      setFormError(
        "The selected vendor needs payment terms before an order can be created.",
      );
      return;
    }

    const suggestedProductId = searchParams.get("productId");
    if (reorderSuggestionId && !suggestedProductId) {
      setFormError("This reorder suggestion is missing its product. Return to the suggestions page and open it again.");
      return;
    }
    if (
      reorderSuggestionId &&
      suggestedProductId &&
      !vendorProductsByProductId.has(suggestedProductId)
    ) {
      setFormError(
        "Choose a supplier that carries the suggested product before creating this draft.",
      );
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        poNumber: poNumber.trim(),
        vendorId,
        destinationLocationId,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantityOrdered: Number(line.quantityOrdered),
        })),
        notes: notes.trim() || undefined,
      });

      const purchaseOrderId = created.data.purchaseOrder.id;
      setCreatedDraftId(purchaseOrderId);
      if (reorderSuggestionId) {
        try {
          await convertSuggestion.mutateAsync({
            id: reorderSuggestionId,
            purchaseOrderId,
          });
        } catch {
          setFormError(
            "The draft was created, but the suggestion is still pending. Open the draft below and review the suggestions page before creating another order.",
          );
          return;
        }
      }
      navigate(`/purchase-orders/${purchaseOrderId}`);
    } catch {
      return;
    }
  };

  const queryErrorMessage =
    loadError instanceof Error
      ? loadError.message
      : "An unexpected error occurred while loading purchase-order options.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <button
            type="button"
            onClick={goBack}
            className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Create Purchase Order
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a draft order using the selected vendor’s current product
            prices.{reorderSuggestionId ? " Suggested product, destination, and quantity were filled from the reorder alert; choose a supplier and review the quantity." : ""}
          </p>
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">
            Could not load purchase-order options.
          </p>
          <p className="mt-1 text-sm text-red-700">{queryErrorMessage}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-6">
            <Card className="p-6">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Order details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Choose an active vendor and destination for this draft.
                </p>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="po-number"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    PO number <span className="text-red-600">*</span>
                  </label>
                  <Input
                    id="po-number"
                    value={poNumber}
                    onChange={(event) => {
                      clearSubmissionErrors();
                      setPoNumber(event.target.value);
                    }}
                    placeholder="e.g. PO-2026-0042"
                    maxLength={100}
                    required
                    aria-invalid={Boolean(fieldErrors.poNumber)}
                  />
                  {fieldErrors.poNumber && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {fieldErrors.poNumber}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="po-vendor"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Vendor <span className="text-red-600">*</span>
                  </label>
                  <SearchableSelect
                    id="po-vendor"
                    value={vendorId}
                    onChange={handleVendorChange}
                    options={vendors.map((vendor) => ({
                      value: vendor.id,
                      label: `${vendor.name} (${vendor.vendorCode})`,
                    }))}
                    placeholder="Search vendors…"
                    emptyMessage="No matching vendors"
                    required
                    disabled={isLoading || Boolean(loadError)}
                    aria-invalid={Boolean(fieldErrors.vendorId)}
                  />
                  {fieldErrors.vendorId && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {fieldErrors.vendorId}
                    </p>
                  )}
                  {selectedVendor && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Payment terms:{" "}
                      {selectedVendor.paymentTerms || "Not configured"}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="po-destination"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Destination <span className="text-red-600">*</span>
                  </label>
                  <Select
                    id="po-destination"
                    value={destinationLocationId}
                    onChange={(event) => {
                      clearSubmissionErrors();
                      setDestinationLocationId(event.target.value);
                    }}
                    required
                    disabled={isLoading || Boolean(loadError)}
                    aria-invalid={Boolean(fieldErrors.destinationLocationId)}
                  >
                    <option value="">Select destination</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} ({location.locationCode})
                      </option>
                    ))}
                  </Select>
                  {fieldErrors.destinationLocationId && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {fieldErrors.destinationLocationId}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="po-currency"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Currency
                  </label>
                  <Input id="po-currency" value="KES" readOnly />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Purchase orders currently use Kenyan shillings.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="po-requested-delivery-date"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Requested delivery date
                  </label>
                  <Input
                    id="po-requested-delivery-date"
                    type="date"
                    min={earliestRequestedDeliveryDate}
                    value={requestedDeliveryDate}
                    onChange={(event) => {
                      clearSubmissionErrors();
                      setRequestedDeliveryDate(event.target.value);
                    }}
                    aria-invalid={Boolean(fieldErrors.requestedDeliveryDate)}
                  />
                  {fieldErrors.requestedDeliveryDate && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {fieldErrors.requestedDeliveryDate}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="po-notes"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="po-notes"
                    value={notes}
                    onChange={(event) => {
                      clearSubmissionErrors();
                      setNotes(event.target.value);
                    }}
                    rows={3}
                    maxLength={2000}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Optional delivery or order notes"
                  />
                </div>
              </div>
            </Card>

            <Card className="relative z-10 overflow-visible p-0">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Order lines
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Prices are sourced from the vendor’s active product list.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !vendorId ||
                    isLoading ||
                    availableVendorProducts.length === 0
                  }
                  onClick={() =>
                    setLines((current) => [...current, createEmptyLine()])
                  }
                >
                  Add line
                </Button>
              </div>

              {!vendorId ? (
                <p className="px-5 py-8 text-sm text-slate-500">
                  Select a vendor to see the products they supply.
                </p>
              ) : vendorProductsQuery.isLoading ? (
                <p className="px-5 py-8 text-sm text-slate-500">
                  Loading vendor products...
                </p>
              ) : availableVendorProducts.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">
                  This vendor has no active products available for purchase.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 px-5">
                  {reorderSuggestionId &&
                    searchParams.get("productId") &&
                    !vendorProductsByProductId.has(searchParams.get("productId")!) && (
                      <p className="my-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                        This supplier does not carry the suggested product. Choose another supplier to continue.
                      </p>
                    )}
                  {lines.map((line, index) => {
                    const selectedAssociation = vendorProductsByProductId.get(
                      line.productId,
                    );
                    const selectedProduct = line.productId
                      ? productsById.get(line.productId)
                      : undefined;
                    const lineError =
                      fieldErrors[`lines.${index}.productId`] ??
                      fieldErrors[`lines.${index}.quantityOrdered`];

                    return (
                      <div
                        key={index}
                        className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] md:items-end"
                      >
                        <div className="min-w-0">
                          <label
                            htmlFor={`po-product-${index}`}
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                          >
                            Product <span className="text-red-600">*</span>
                          </label>
                          <SearchableSelect
                            id={`po-product-${index}`}
                            value={line.productId}
                            onChange={(productId) =>
                              updateLine(index, "productId", productId)
                            }
                            options={availableVendorProducts.flatMap(
                              (vendorProduct) => {
                                const product = productsById.get(
                                  vendorProduct.productId,
                                );
                                if (!product) return [];

                                const usedByAnotherLine = lines.some(
                                  (otherLine, otherIndex) =>
                                    otherIndex !== index &&
                                    otherLine.productId === product.id,
                                );

                                return [{
                                  value: product.id,
                                  label: `${product.sku} · ${product.name}`,
                                  disabled: usedByAnotherLine,
                                }];
                              },
                            )}
                            placeholder="Search vendor products…"
                            emptyMessage="No matching vendor products"
                            required
                            disabled={
                              isLoading ||
                              Boolean(loadError) ||
                              (Boolean(reorderSuggestionId) &&
                                line.productId === searchParams.get("productId"))
                            }
                            aria-invalid={Boolean(lineError)}
                          />
                          {lineError && (
                            <p className="mt-1.5 text-sm text-red-600">
                              {lineError}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor={`po-quantity-${index}`}
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                          >
                            Quantity <span className="text-red-600">*</span>
                          </label>
                          <Input
                            id={`po-quantity-${index}`}
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantityOrdered}
                            onChange={(event) =>
                              updateLine(
                                index,
                                "quantityOrdered",
                                event.target.value,
                              )
                            }
                            required
                            aria-invalid={Boolean(lineError)}
                          />
                        </div>

                        <div className="text-sm md:pb-2">
                          <p className="text-xs text-slate-500">Unit price</p>
                          <p className="mt-1 font-medium tabular-nums text-slate-900">
                            {selectedAssociation
                              ? formatKes(
                                  Math.round(
                                    Number(selectedAssociation.currentPrice) *
                                      100,
                                  ),
                                )
                              : "-"}
                          </p>
                          {selectedProduct && (
                            <p className="mt-0.5 text-xs text-slate-500">
                              per {selectedProduct.unitOfMeasure}
                            </p>
                          )}
                        </div>

                        <div className="flex md:pb-1">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((current) =>
                                current.filter(
                                  (_, lineIndex) => lineIndex !== index,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="p-5">
              <h2 className="text-base font-semibold text-slate-950">
                Draft summary
              </h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Vendor</dt>
                  <dd className="max-w-44 truncate text-right font-medium text-slate-900">
                    {selectedVendor?.name ?? "Not selected"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Line items</dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {lines.filter((line) => line.productId).length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
                  <dt className="font-medium text-slate-700">
                    Estimated total
                  </dt>
                  <dd className="text-right font-semibold tabular-nums text-slate-950">
                    {formatKes(estimatedTotalCents)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Maximum PO value</dt>
                  <dd className="text-right font-medium tabular-nums text-slate-900">
                    {policyQuery.data
                      ? formatKes(maxPoValueCents ?? 0)
                      : policyQuery.isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </dd>
                </div>
              </dl>
              {exceedsLimit && (
                <p
                  className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  role="status"
                >
                  This estimate exceeds the KES limit. You can save it as a
                  draft, but the server will reject submission for approval.
                </p>
              )}
              {policyQuery.isError && (
                <p className="mt-3 text-sm text-slate-600" role="status">
                  The configured limit could not be loaded. The server will
                  still enforce it when you submit the order.
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Final prices are validated against the vendor catalog when the
                order is created.
              </p>

              {(formError || createMutation.error) && (
                <div
                  className="mt-4 rounded-md border border-red-200 bg-red-50 p-3"
                  role="alert"
                >
                  <p className="text-sm font-medium text-red-800">
                    {formError ||
                      (createMutation.error instanceof Error
                        ? createMutation.error.message
                        : "Unable to create purchase order.")}
                  </p>
                  {createdDraftId && (
                    <Link
                      className="mt-2 inline-block text-sm font-medium text-blue-700 underline"
                      to={`/purchase-orders/${createdDraftId}`}
                    >
                      Open the draft purchase order
                    </Link>
                  )}
                  {createMutation.error &&
                    Object.entries(fieldErrors).length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-red-700">
                        {Object.entries(fieldErrors).map(([field, message]) => (
                          <li key={field}>
                            <span className="font-medium">
                              {formatErrorField(field)}:
                            </span>{" "}
                            {message}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}

              <div className="mt-5 space-y-2">
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    convertSuggestion.isPending ||
                    Boolean(createdDraftId) ||
                    isLoading ||
                    Boolean(loadError) ||
                    !selectedVendor?.paymentTerms
                  }
                >
                  {createMutation.isPending
                    ? "Creating..."
                    : convertSuggestion.isPending
                      ? "Linking suggestion..."
                      : createdDraftId
                        ? "Draft created"
                        : "Create draft order"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={goBack}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  );
}

export default CreatePurchaseOrderPage;

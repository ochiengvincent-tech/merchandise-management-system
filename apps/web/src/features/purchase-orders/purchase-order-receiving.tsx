import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { usePurchaseOrderReferences, useReceivePurchaseOrder } from "./hooks";
import { getFieldErrorMap } from "../../lib/api/client";
import type { PurchaseOrderResponse } from "./types";

type PurchaseOrderWithLines = PurchaseOrderResponse["data"];

export function PurchaseOrderReceiving({
  purchaseOrder,
}: {
  purchaseOrder: PurchaseOrderWithLines;
}) {
  const canReceive =
    purchaseOrder.status === "SENT" ||
    purchaseOrder.status === "PARTIALLY_RECEIVED";
  const mutation = useReceivePurchaseOrder();
  const [receiving, setReceiving] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const productReferences = usePurchaseOrderReferences(
    [],
    [],
    purchaseOrder.lines.map((line) => line.productId),
  );

  if (!canReceive) return null;

  const fieldErrors = { ...getFieldErrorMap(mutation.error), ...validationErrors };
  const hasRemaining = purchaseOrder.lines.some(
    (line) => line.quantityReceived < line.quantityOrdered,
  );

  const setQuantity = (lineId: string, value: string) => {
    setQuantities((current) => ({ ...current, [lineId]: value }));
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[lineId];
      delete next.form;
      return next;
    });
    setFormError("");
    setSuccessMessage("");
    mutation.reset();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    const items: Array<{ purchaseOrderLineId: string; quantityReceived: number }> = [];
    const errors: Record<string, string> = {};
    for (const line of purchaseOrder.lines) {
      const rawQuantity = quantities[line.id] ?? "";
      if (!rawQuantity.trim()) continue;
      const quantity = Number(rawQuantity);
      const remaining = line.quantityOrdered - line.quantityReceived;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        errors[line.id] = "Enter a positive whole-number quantity.";
      } else if (quantity > remaining) {
        errors[line.id] = `Enter ${remaining} or fewer; that is the remaining quantity.`;
      } else {
        items.push({ purchaseOrderLineId: line.id, quantityReceived: quantity });
      }
    }

    if (items.length === 0 && Object.keys(errors).length === 0) {
      errors.form = "Enter a received quantity for at least one line.";
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await mutation.mutateAsync({ id: purchaseOrder.id, items });
      setQuantities({});
      setReceiving(false);
      setSuccessMessage("Receipt recorded. The purchase order quantities and status have been updated.");
    } catch (error) {
      const apiErrors = getFieldErrorMap(error);
      if (Object.keys(apiErrors).length === 0 && error instanceof Error) {
        setFormError(error.message);
      }
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Receive items</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record the quantities delivered. You can receive the order in multiple deliveries.
          </p>
          {successMessage && <p role="status" className="mt-2 text-sm text-green-700">{successMessage}</p>}
          {!hasRemaining && <p role="status" className="mt-2 text-sm text-slate-600">All ordered quantities have been received.</p>}
        </div>
        {hasRemaining && !receiving && (
          <Button variant="secondary" onClick={() => setReceiving(true)}>Record receipt</Button>
        )}
      </div>

      {receiving && hasRemaining && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          {fieldErrors.form && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fieldErrors.form}</p>}
          <div className="space-y-3">
            {purchaseOrder.lines.map((line) => {
              const remaining = line.quantityOrdered - line.quantityReceived;
              const error = fieldErrors[line.id] ?? fieldErrors[`items.${line.id}.quantityReceived`];
              const product = productReferences.products.get(line.productId);
              return (
                <div key={line.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(100px,1fr))] sm:items-end">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{product ? `${product.sku} · ${product.name}` : productReferences.isLoading ? "Loading product…" : `Product ${line.productId}`}</p>
                    <p className="mt-1 text-xs text-slate-500">Line total {purchaseOrder.currency} {Number(line.lineTotal).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div><p className="text-xs uppercase tracking-wide text-slate-500">Ordered</p><p className="mt-1 text-sm text-slate-900">{line.quantityOrdered}</p></div>
                  <div><p className="text-xs uppercase tracking-wide text-slate-500">Received</p><p className="mt-1 text-sm text-slate-900">{line.quantityReceived}</p></div>
                  <div>
                    <label htmlFor={`receive-${line.id}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Receive (up to {remaining})</label>
                    <Input id={`receive-${line.id}`} type="number" min="1" max={remaining} step="1" value={quantities[line.id] ?? ""} disabled={mutation.isPending || remaining <= 0} onChange={(event) => setQuantity(line.id, event.target.value)} aria-invalid={Boolean(error)} />
                    {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Recording…" : "Confirm receipt"}</Button>
            <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => { setReceiving(false); setValidationErrors({}); setFormError(""); }}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

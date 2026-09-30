import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { z } from "zod";
import type { RecordGoodsReceiptInput } from "./api";
import { useRecordGoodsReceipt, useReceivingPurchaseOrder } from "./hooks";

type LineCount = {
  include: boolean;
  observed: string;
  damaged: string;
};

const pendingSubmissionSchema = z.object({
  idempotencyKey: z.uuid(),
  input: z.object({
    purchaseOrderId: z.uuid(),
    supplierDeliveryNote: z.string().optional(),
    notes: z.string().optional(),
    lines: z.array(z.object({
      purchaseOrderLineId: z.uuid().optional(),
      productId: z.uuid(),
      productCode: z.string(),
      quantityObserved: z.number().int().nonnegative(),
      quantityDamaged: z.number().int().nonnegative(),
      notes: z.string().optional(),
    })),
  }),
});

type PendingSubmission = z.infer<typeof pendingSubmissionSchema>;

function pendingStorageKey(purchaseOrderId: string) {
  return `mms:receiving:pending:${purchaseOrderId}`;
}

function loadPendingSubmission(purchaseOrderId: string): PendingSubmission | null {
  try {
    const stored = window.sessionStorage.getItem(pendingStorageKey(purchaseOrderId));
    if (!stored) return null;
    const parsed = pendingSubmissionSchema.safeParse(JSON.parse(stored));
    if (parsed.success && parsed.data.input.purchaseOrderId === purchaseOrderId) {
      return parsed.data;
    }
  } catch {
    // Ignore unavailable session storage or an invalid saved form value.
  }
  window.sessionStorage.removeItem(pendingStorageKey(purchaseOrderId));
  return null;
}

export function ReceiveGoodsForm({ purchaseOrderId }: { purchaseOrderId: string }) {
  const navigate = useNavigate();
  const purchaseOrderQuery = useReceivingPurchaseOrder(purchaseOrderId);
  const recordMutation = useRecordGoodsReceipt();
  const [deliveryNote, setDeliveryNote] = useState("");
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<string, LineCount>>({});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(
    () => loadPendingSubmission(purchaseOrderId),
  );
  const [localError, setLocalError] = useState("");
  const [confirmedDiscrepancies, setConfirmedDiscrepancies] = useState(false);

  useEffect(() => {
    const order = purchaseOrderQuery.data;
    if (!order) return;
    const savedLines = pendingSubmission?.input.lines ?? [];
    setCounts(Object.fromEntries(order.lines.map((line) => {
      const savedLine = savedLines.find((item) => item.purchaseOrderLineId === line.id);
      return [line.id, {
        include: Boolean(savedLine),
        observed: String(savedLine?.quantityObserved ?? ""),
        damaged: String(savedLine?.quantityDamaged ?? 0),
      }];
    })));
    if (pendingSubmission) {
      setDeliveryNote(pendingSubmission.input.supplierDeliveryNote ?? "");
      setNotes(pendingSubmission.input.notes ?? "");
      setConfirmedDiscrepancies(true);
    }
  }, [purchaseOrderQuery.data, pendingSubmission]);

  if (purchaseOrderQuery.isLoading) {
    return <Card className="p-6 text-sm text-slate-500">Loading purchase order…</Card>;
  }
  if (purchaseOrderQuery.error || !purchaseOrderQuery.data) {
    return (
      <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
        Could not load this purchase order. {purchaseOrderQuery.error?.message}
      </Card>
    );
  }

  const purchaseOrder = purchaseOrderQuery.data;
  const frozen = pendingSubmission !== null;
  const includedLines = purchaseOrder.lines.filter((line) => counts[line.id]?.include);
  const needsDiscrepancyConfirmation = includedLines.some((line) => {
    const count = counts[line.id];
    if (!count) return false;
    const observed = Number(count.observed) || 0;
    const damaged = Number(count.damaged) || 0;
    return count.observed.trim() !== "" && (damaged > 0 || observed > line.quantityOutstanding);
  });

  const updateLine = (lineId: string, update: Partial<LineCount>) => {
    setCounts((current) => ({
      ...current,
      [lineId]: { ...current[lineId]!, ...update },
    }));
    setLocalError("");
    setConfirmedDiscrepancies(false);
    if (recordMutation.isError) recordMutation.reset();
  };

  const submit = () => {
    if (includedLines.length === 0) {
      setLocalError("Select at least one inspected PO line to record.");
      return;
    }

    if (includedLines.some((line) => counts[line.id]?.observed.trim() === "")) {
      setLocalError("Enter the total physical count for each selected line. Enter 0 if none arrived.");
      return;
    }

    const lines = includedLines.map((line) => ({
      purchaseOrderLineId: line.id,
      productId: line.productId,
      productCode: line.product.sku,
      quantityObserved: Number(counts[line.id]?.observed ?? 0),
      quantityDamaged: Number(counts[line.id]?.damaged ?? 0),
    }));
    const invalidLine = lines.find((line) =>
      !Number.isInteger(line.quantityObserved) ||
      !Number.isInteger(line.quantityDamaged) ||
      line.quantityObserved < 0 ||
      line.quantityDamaged < 0 ||
      line.quantityDamaged > line.quantityObserved,
    );
    if (invalidLine) {
      setLocalError("Observed and damaged quantities must be nonnegative whole numbers, and damaged quantity cannot exceed observed quantity.");
      return;
    }
    if (needsDiscrepancyConfirmation && !confirmedDiscrepancies) {
      setLocalError("Confirm that you reviewed the damaged or excess quantities before recording this GRN.");
      return;
    }

    const input: RecordGoodsReceiptInput = {
      purchaseOrderId,
      supplierDeliveryNote: deliveryNote.trim() || undefined,
      notes: notes.trim() || undefined,
      lines,
    };
    const key = crypto.randomUUID();
    const pending = { idempotencyKey: key, input };
    window.sessionStorage.setItem(pendingStorageKey(purchaseOrderId), JSON.stringify(pending));
    setPendingSubmission(pending);
    recordMutation.mutate({
      input,
      idempotencyKey: key,
    }, {
      onSuccess: (receipt) => {
        window.sessionStorage.removeItem(pendingStorageKey(purchaseOrderId));
        setPendingSubmission(null);
        navigate(`/receiving/receipts/${receipt.id}`);
      },
    });
  };

  const retryPending = () => {
    if (!pendingSubmission) return;
    recordMutation.mutate(pendingSubmission, {
      onSuccess: (receipt) => {
        window.sessionStorage.removeItem(pendingStorageKey(purchaseOrderId));
        setPendingSubmission(null);
        navigate(`/receiving/receipts/${receipt.id}`);
      },
    });
  };

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Inspect delivery</h2>
        <p className="mt-1 text-sm text-slate-500">
          {purchaseOrder.poNumber} · enter the physical count delivered and how many were damaged. Observed includes damaged units; Receiving calculates accepted quantities against the remaining PO balance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          Supplier delivery note
          <Input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} disabled={frozen} maxLength={100} placeholder="e.g. DN-2026-014" />
          <span className="block text-xs font-normal text-slate-500">Optional reference number from the supplier’s delivery paperwork.</span>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          Receiving notes
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={frozen} maxLength={4000} placeholder="e.g. One carton was wet on arrival." />
          <span className="block text-xs font-normal text-slate-500">Optional internal notes about the delivery or inspection.</span>
        </label>
      </div>

      <div className="space-y-3">
        {purchaseOrder.lines.map((line) => {
          const count = counts[line.id] ?? { include: false, observed: "", damaged: "0" };
          const observed = Number(count.observed) || 0;
          const damaged = Number(count.damaged) || 0;
          const accepted = Math.min(Math.max(observed - damaged, 0), line.quantityOutstanding);
          const rejected = observed - accepted;

          return (
            <div key={line.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    checked={count.include}
                    disabled={frozen}
                    onChange={(event) => updateLine(line.id, { include: event.target.checked })}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{line.product.name}</span>
                    <span className="block text-xs text-slate-500">{line.product.sku}</span>
                  </span>
                </label>
                <span className="text-sm text-slate-600">Outstanding on PO: <strong>{line.quantityOutstanding}</strong></span>
              </div>

              {count.include && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 text-sm text-slate-600">
                    Observed quantity
                    <Input type="number" min="0" step="1" value={count.observed} disabled={frozen} onChange={(event) => updateLine(line.id, { observed: event.target.value })} placeholder="Total units counted" />
                    <span className="block text-xs text-slate-500">Count every unit delivered, including damaged units.</span>
                  </label>
                  <label className="space-y-1 text-sm text-slate-600">
                    Damaged quantity
                    <Input type="number" min="0" step="1" value={count.damaged} disabled={frozen} onChange={(event) => updateLine(line.id, { damaged: event.target.value })} />
                    <span className="block text-xs text-slate-500">This is part of the observed quantity.</span>
                  </label>
                  {count.observed.trim() !== "" && (
                    <>
                      <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
                        Accepted <strong className="ml-1">{accepted}</strong>
                      </div>
                      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                        Rejected / excess <strong className="ml-1">{rejected}</strong>
                      </div>
                    </>
                  )}
                </div>
              )}
              {count.include && count.observed.trim() !== "" && (observed < line.quantityOutstanding || observed > line.quantityOutstanding || damaged > 0) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Receipt discrepancies">
                  {observed < line.quantityOutstanding && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                      Short by {line.quantityOutstanding - observed}
                    </span>
                  )}
                  {observed > line.quantityOutstanding && (
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-900">
                      Excess {observed - line.quantityOutstanding} will not be accepted
                    </span>
                  )}
                  {damaged > 0 && (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-900">
                      Damaged {damaged}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {needsDiscrepancyConfirmation && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Review damaged or excess quantities</p>
          <p className="mt-1">Damaged and excess units are recorded on the GRN but will not be accepted into Inventory stock.</p>
          <label className="mt-3 flex items-start gap-2.5 font-medium">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-amber-400 text-teal-700 focus:ring-teal-600"
              checked={confirmedDiscrepancies}
              disabled={frozen}
              onChange={(event) => {
                setConfirmedDiscrepancies(event.target.checked);
                setLocalError("");
              }}
            />
            I reviewed the discrepancy quantities and want to record them.
          </label>
        </div>
      )}

      {(localError || recordMutation.error) && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {localError || recordMutation.error?.message}
          {pendingSubmission && <p className="mt-1">Retry the saved receipt to safely finish the same GRN. Its quantities are locked while sync is pending.</p>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <Button variant="secondary" disabled={recordMutation.isPending} onClick={() => navigate("/receiving")}>Cancel</Button>
        <Button disabled={recordMutation.isPending} onClick={pendingSubmission ? retryPending : submit}>
          {recordMutation.isPending ? "Recording GRN…" : pendingSubmission ? "Retry saved GRN" : "Record goods received"}
        </Button>
      </div>
    </Card>
  );
}

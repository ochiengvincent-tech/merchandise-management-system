import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import {
  useApprovePurchaseOrderAmendment,
  usePurchaseOrderAmendmentQueue,
  usePurchaseOrderReferences,
  useRejectPurchaseOrderAmendment,
} from "../../features/purchase-orders/hooks";
import type { PurchaseOrderAmendmentQueueItem } from "../../features/purchase-orders/types";
import { CURRENT_ACTOR_ID } from "../../lib/api/config";

const PAGE_SIZE = 20;
type AmendmentStatus = "PENDING" | "APPROVED" | "REJECTED";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChange(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not specified";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function amendmentStatusVariant(status: AmendmentStatus) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REJECTED") return "danger" as const;
  return "warning" as const;
}

export function AmendmentsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AmendmentStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState("");
  const [rejectionComments, setRejectionComments] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const amendmentsQuery = usePurchaseOrderAmendmentQueue({
    page,
    limit: PAGE_SIZE,
    status,
  });
  const approveMutation = useApprovePurchaseOrderAmendment();
  const rejectMutation = useRejectPurchaseOrderAmendment();
  const amendments = amendmentsQuery.data?.data ?? [];
  const total = amendmentsQuery.data?.pagination.total ?? 0;
  const totalPages = Math.max(1, amendmentsQuery.data?.pagination.totalPages ?? 1);
  const locationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of amendments) {
      ids.add(item.purchaseOrder.destinationLocationId);
      const previous = item.previousData.destinationLocationId;
      const next = item.newData.destinationLocationId;
      if (typeof previous === "string") ids.add(previous);
      if (typeof next === "string") ids.add(next);
    }
    return [...ids];
  }, [amendments]);
  const references = usePurchaseOrderReferences(
    [...new Set(amendments.map((item) => item.purchaseOrder.vendorId))],
    locationIds,
  );
  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setActionError("");
    setActionSuccess("");
    try {
      await action();
      setActionSuccess(success);
      setRejectingId("");
      setRejectionComments("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The amendment action failed.");
    }
  };

  const startReject = (amendmentId: string) => {
    setActionError("");
    setActionSuccess("");
    setRejectingId(amendmentId);
    setRejectionComments("");
  };

  const rejectAmendment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejectingId) return;
    await runAction(
      () => rejectMutation.mutateAsync({
        id: rejectingId,
        comments: rejectionComments.trim() || undefined,
      }),
      "Amendment rejected.",
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Amendments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review requested changes to approved or sent purchase orders.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="amendment-status" className="sr-only">Amendment status</label>
          <Select
            id="amendment-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AmendmentStatus);
              setPage(1);
              setActionError("");
              setActionSuccess("");
            }}
          >
            <option value="PENDING">Pending review</option>
            <option value="APPROVED">Approved history</option>
            <option value="REJECTED">Rejected history</option>
          </Select>
        </div>
      </div>

      {actionError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
      {actionSuccess && <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{actionSuccess}</p>}

      <Card className="overflow-hidden p-0">
        {amendmentsQuery.isLoading && <p role="status" className="p-8 text-center text-sm text-slate-500">Loading amendments…</p>}
        {amendmentsQuery.isError && (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-red-700">Unable to load amendments.</p>
            <p className="mt-1 text-sm text-slate-500">
              {amendmentsQuery.error instanceof Error ? amendmentsQuery.error.message : "An unexpected error occurred."}
            </p>
          </div>
        )}
        {amendmentsQuery.isSuccess && amendments.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              {status === "PENDING" ? "No amendments are waiting for review." : `No ${status.toLowerCase()} amendments found.`}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {status === "PENDING" ? "Amendment requests for approved or sent purchase orders will appear here." : "Choose another status to view different amendment records."}
            </p>
          </div>
        )}
        {amendments.length > 0 && (
          <div className="divide-y divide-slate-200">
            {amendments.map((amendment) => (
              <AmendmentCard
                key={amendment.id}
                amendment={amendment}
                vendorName={references.vendors.get(amendment.purchaseOrder.vendorId)?.name}
                locationNames={new Map(
                  [...references.locations].flatMap(([id, location]) => location ? [[id, location.name] as const] : []),
                )}
                isPending={isPending}
                isRejecting={rejectingId === amendment.id}
                rejectionComments={rejectionComments}
                onOpenPurchaseOrder={() => navigate(`/purchase-orders/${amendment.purchaseOrderId}`)}
                onApprove={() => void runAction(
                  () => approveMutation.mutateAsync(amendment.id),
                  "Amendment approved and applied to the purchase order.",
                )}
                onStartReject={() => startReject(amendment.id)}
                onCancelReject={() => setRejectingId("")}
                onCommentsChange={setRejectionComments}
                onReject={rejectAmendment}
              />
            ))}
          </div>
        )}
        {amendmentsQuery.isSuccess && total > 0 && (
          <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} {status.toLowerCase()} amendments
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page === 1 || amendmentsQuery.isFetching} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <span className="px-2 text-sm text-slate-600">Page {page} of {totalPages}</span>
              <Button variant="secondary" disabled={page === totalPages || amendmentsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

type AmendmentCardProps = {
  amendment: PurchaseOrderAmendmentQueueItem;
  vendorName?: string;
  locationNames: Map<string, string>;
  isPending: boolean;
  isRejecting: boolean;
  rejectionComments: string;
  onOpenPurchaseOrder: () => void;
  onApprove: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onCommentsChange: (value: string) => void;
  onReject: (event: React.FormEvent<HTMLFormElement>) => void;
};

function AmendmentCard({
  amendment,
  vendorName,
  locationNames,
  isPending,
  isRejecting,
  rejectionComments,
  onOpenPurchaseOrder,
  onApprove,
  onStartReject,
  onCancelReject,
  onCommentsChange,
  onReject,
}: AmendmentCardProps) {
  const { previousData, newData } = amendment;
  const notesChanged = Object.hasOwn(newData, "notes");
  const destinationChanged = Object.hasOwn(newData, "destinationLocationId");
  const oldDestination = previousData.destinationLocationId;
  const newDestination = newData.destinationLocationId;
  const isRequester = amendment.requestedBy === CURRENT_ACTOR_ID;
  const status = amendment.status as AmendmentStatus;

  const destinationLabel = (value: unknown) => {
    if (typeof value === "string") return locationNames.get(value) ?? value;
    return formatChange(value);
  };

  return (
    <article className="p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-950">
              {amendment.purchaseOrder.poNumber} · Amendment #{amendment.amendmentNumber}
            </h2>
            <Badge variant={amendmentStatusVariant(status)}>{status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {vendorName ?? "Vendor details unavailable"} · {amendment.purchaseOrder.status.replaceAll("_", " ")} · {amendment.purchaseOrder.currency} {Number(amendment.purchaseOrder.totalAmount).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-slate-500">Requested {formatDateTime(amendment.createdAt)} · Requester {amendment.requestedBy}</p>
        </div>
        <Button variant="secondary" onClick={onOpenPurchaseOrder}>Open purchase order</Button>
      </div>

      <p className="mt-4 text-sm text-slate-800">{amendment.reason}</p>
      {(notesChanged || destinationChanged) && (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {notesChanged && (
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes change</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{formatChange(previousData.notes)} → {formatChange(newData.notes)}</dd>
            </div>
          )}
          {destinationChanged && (
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Destination change</dt>
              <dd className="mt-1 text-sm text-slate-800">{destinationLabel(oldDestination)} → {destinationLabel(newDestination)}</dd>
            </div>
          )}
        </dl>
      )}

      {amendment.status === "PENDING" && isRequester && (
        <p role="status" className="mt-4 text-sm text-amber-800">You requested this amendment and cannot approve or reject it.</p>
      )}
      {amendment.status === "PENDING" && !isRequester && !isRejecting && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={isPending} onClick={onStartReject}>Reject</Button>
          <Button disabled={isPending} onClick={onApprove}>{isPending ? "Processing…" : "Approve amendment"}</Button>
        </div>
      )}
      {isRejecting && (
        <form onSubmit={onReject} className="mt-4 max-w-2xl space-y-3">
          <label htmlFor={`reject-amendment-${amendment.id}`} className="block text-sm font-medium text-slate-700">Rejection comments <span className="font-normal text-slate-500">(optional)</span></label>
          <textarea id={`reject-amendment-${amendment.id}`} value={rejectionComments} maxLength={2000} rows={3} disabled={isPending} onChange={(event) => onCommentsChange(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Explain why this amendment is being rejected" />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={isPending}>{isPending ? "Rejecting…" : "Confirm rejection"}</Button>
            <Button type="button" variant="secondary" disabled={isPending} onClick={onCancelReject}>Keep pending</Button>
          </div>
        </form>
      )}
    </article>
  );
}

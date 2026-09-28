import { useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import { useLocations } from "../locations/hooks";
import { CURRENT_ACTOR_ID } from "../../lib/api/config";
import type { PurchaseOrder } from "./types";
import {
  useApprovePurchaseOrderAmendment,
  usePurchaseOrderAmendments,
  useRejectPurchaseOrderAmendment,
  useRequestPurchaseOrderAmendment,
} from "./hooks";

type PurchaseOrderAmendmentsProps = {
  purchaseOrder: PurchaseOrder;
};

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value || "(empty)";
  }
  return value === null || value === undefined ? "(empty)" : String(value);
}

export function PurchaseOrderAmendments({
  purchaseOrder,
}: PurchaseOrderAmendmentsProps) {
  const amendmentsQuery = usePurchaseOrderAmendments(purchaseOrder.id);
  const locationsQuery = useLocations({ status: "ACTIVE" });
  const requestMutation = useRequestPurchaseOrderAmendment();
  const approveMutation = useApprovePurchaseOrderAmendment();
  const rejectMutation = useRejectPurchaseOrderAmendment();

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reason, setReason] = useState("");
  const [updateNotes, setUpdateNotes] = useState(false);
  const [notes, setNotes] = useState(purchaseOrder.notes ?? "");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [rejectingAmendmentId, setRejectingAmendmentId] = useState("");
  const [rejectionComments, setRejectionComments] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const amendments = amendmentsQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );
  const canRequest =
    purchaseOrder.status === "APPROVED" || purchaseOrder.status === "SENT";
  const isPending =
    requestMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;

  if (!canRequest && amendments.length === 0 && !amendmentsQuery.isLoading) {
    return null;
  }

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError("");
    setActionSuccess("");
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The amendment action failed.",
      );
    }
  };

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!updateNotes && !destinationLocationId) {
      setActionError("Choose notes or a destination to amend.");
      return;
    }

    await runAction(async () => {
      await requestMutation.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        reason: reason.trim(),
        ...(updateNotes ? { notes } : {}),
        ...(destinationLocationId ? { destinationLocationId } : {}),
      });
      setReason("");
      setUpdateNotes(false);
      setNotes(purchaseOrder.notes ?? "");
      setDestinationLocationId("");
      setShowRequestForm(false);
      setActionSuccess("Amendment request submitted for review.");
    });
  };

  const handleReject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejectingAmendmentId) return;

    await runAction(async () => {
      await rejectMutation.mutateAsync({
        id: rejectingAmendmentId,
        comments: rejectionComments.trim() || undefined,
      });
      setRejectingAmendmentId("");
      setRejectionComments("");
    });
  };

  return (
    <Card className={canRequest ? "border-teal-200 bg-teal-50/30 p-6" : "p-6"}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Amendments</h2>
          <p className="mt-1 text-sm text-slate-600">
            {canRequest
              ? "Need to change notes or destination? Submit an amendment for review. Approved terms stay in place until it is approved."
              : "Approved commercial terms remain unchanged until an amendment is approved."}
          </p>
        </div>
        {canRequest && !showRequestForm && (
          <Button
            onClick={() => {
              setActionError("");
              setActionSuccess("");
              setShowRequestForm(true);
            }}
          >
            Request amendment
          </Button>
        )}
      </div>

      {actionSuccess && (
        <p role="status" className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {actionSuccess}
        </p>
      )}

      {amendmentsQuery.isLoading && (
        <p className="mt-4 text-sm text-slate-500">
          Loading amendment history...
        </p>
      )}
      {amendmentsQuery.isError && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {amendmentsQuery.error instanceof Error
            ? amendmentsQuery.error.message
            : "Unable to load amendment history."}
        </p>
      )}
      {amendments.length === 0 && amendmentsQuery.isSuccess && (
        <p className="mt-4 text-sm text-slate-500">No amendments requested.</p>
      )}

      {amendments.length > 0 && (
        <ol className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
          {amendments.map((amendment) => {
            const previousData = amendment.previousData;
            const newData = amendment.newData;
            const oldDestination = previousData.destinationLocationId;
            const newDestination = newData.destinationLocationId;
            const notesWereChanged = Object.hasOwn(newData, "notes");
            const destinationWasChanged = Object.hasOwn(
              newData,
              "destinationLocationId",
            );
            const isRequester = amendment.requestedBy === CURRENT_ACTOR_ID;

            return (
              <li key={amendment.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Amendment #{amendment.amendmentNumber}
                  </h3>
                  <Badge
                    variant={
                      amendment.status === "APPROVED"
                        ? "success"
                        : amendment.status === "REJECTED"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {amendment.status}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(amendment.createdAt)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  {amendment.reason}
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  Requested by {amendment.requestedBy}
                </p>

                {(notesWereChanged || destinationWasChanged) && (
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {notesWereChanged && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Notes change
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          {formatValue(previousData.notes)} →{" "}
                          {formatValue(newData.notes)}
                        </dd>
                      </div>
                    )}
                    {destinationWasChanged && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Destination change
                        </dt>
                        <dd className="mt-1 text-sm text-slate-700">
                          {locationsById.get(String(oldDestination))?.name ??
                            formatValue(oldDestination)}
                          {" → "}
                          {locationsById.get(String(newDestination))?.name ??
                            formatValue(newDestination)}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {amendment.status === "PENDING" && !isRequester && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => {
                        setRejectingAmendmentId(amendment.id);
                        setActionError("");
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        void runAction(() =>
                          approveMutation.mutateAsync(amendment.id),
                        )
                      }
                    >
                      {approveMutation.isPending
                        ? "Approving..."
                        : "Approve amendment"}
                    </Button>
                  </div>
                )}

                {amendment.status === "PENDING" && isRequester && (
                  <p className="mt-3 text-sm text-amber-800" role="status">
                    You requested this amendment and cannot approve or reject
                    it.
                  </p>
                )}

                {rejectingAmendmentId === amendment.id && (
                  <form onSubmit={handleReject} className="mt-4 space-y-3">
                    <label
                      htmlFor={`amendment-rejection-${amendment.id}`}
                      className="block text-sm font-medium text-slate-700"
                    >
                      Rejection comments
                    </label>
                    <textarea
                      id={`amendment-rejection-${amendment.id}`}
                      value={rejectionComments}
                      onChange={(event) =>
                        setRejectionComments(event.target.value)
                      }
                      rows={2}
                      maxLength={2000}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="danger"
                        disabled={isPending}
                      >
                        Confirm rejection
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => setRejectingAmendmentId("")}
                      >
                        Keep pending
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {showRequestForm && (
        <form
          onSubmit={handleRequest}
          className="mt-5 space-y-4 border-t border-slate-200 pt-5"
        >
          <div>
            <label
              htmlFor="amendment-reason"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              id="amendment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={2000}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Why does this approved order need to change?"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={updateNotes}
              onChange={(event) => setUpdateNotes(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Amend order notes
          </label>
          {updateNotes && (
            <textarea
              aria-label="Amended order notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Enter the replacement notes; leave empty to clear notes"
            />
          )}

          <div>
            <label
              htmlFor="amendment-destination"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              New destination
            </label>
            <Select
              id="amendment-destination"
              value={destinationLocationId}
              onChange={(event) => setDestinationLocationId(event.target.value)}
              disabled={locationsQuery.isLoading || locationsQuery.isError}
            >
              <option value="">No change</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.locationCode})
                </option>
              ))}
            </Select>
            {locationsQuery.isError && (
              <p className="mt-1 text-sm text-red-600">
                Unable to load active destinations.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                isPending ||
                (Boolean(destinationLocationId) && locationsQuery.isError)
              }
            >
              {requestMutation.isPending ? "Requesting..." : "Submit amendment"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setShowRequestForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}
    </Card>
  );
}

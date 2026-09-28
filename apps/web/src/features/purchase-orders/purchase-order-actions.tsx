import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useSendPurchaseOrder,
  useSubmitPurchaseOrder,
  usePurchaseOrderPolicy,
  useCancelPurchaseOrder,
} from "./hooks";
import { CURRENT_ACTOR_ID } from "../../lib/api/config";
import type { PurchaseOrder } from "./types";

type PurchaseOrderActionsProps = {
  purchaseOrder: PurchaseOrder;
};

export function PurchaseOrderActions({
  purchaseOrder,
}: PurchaseOrderActionsProps) {
  const submitMutation = useSubmitPurchaseOrder();
  const approveMutation = useApprovePurchaseOrder();
  const rejectMutation = useRejectPurchaseOrder();
  const sendMutation = useSendPurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();
  const policyQuery = usePurchaseOrderPolicy();

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [comments, setComments] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const isPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    sendMutation.isPending ||
    cancelMutation.isPending;
  const isCreator = purchaseOrder.createdBy === CURRENT_ACTOR_ID;
  const canCancel = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
    "PARTIALLY_RECEIVED",
  ].includes(purchaseOrder.status);
  const maxPoValueCents = policyQuery.data
    ? Math.round(Number(policyQuery.data.data.maxPoValueKes) * 100)
    : null;
  const purchaseOrderTotalCents = Math.round(
    Number(purchaseOrder.totalAmount) * 100,
  );
  const exceedsLimit =
    purchaseOrder.currency === "KES" &&
    maxPoValueCents !== null &&
    purchaseOrderTotalCents > maxPoValueCents;

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError("");
    setActionSuccess("");
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The purchase-order action failed.",
      );
    }
  };

  const handleReject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(async () => {
      await rejectMutation.mutateAsync({
        id: purchaseOrder.id,
        comments: comments.trim() || undefined,
      });
      setShowRejectForm(false);
      setComments("");
      setActionSuccess(
        "Returned to draft. Review the order before resubmitting.",
      );
    });
  };

  const handleCancel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(() =>
      cancelMutation.mutateAsync({
        id: purchaseOrder.id,
        reason: cancellationReason.trim(),
      }),
    );
  };

  if (
    purchaseOrder.status !== "DRAFT" &&
    purchaseOrder.status !== "PENDING_APPROVAL" &&
    purchaseOrder.status !== "APPROVED" &&
    !canCancel
  ) {
    return null;
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Purchase order actions
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {purchaseOrder.status === "DRAFT" &&
              "Submit this draft for review before sending it to the vendor."}
            {purchaseOrder.status === "PENDING_APPROVAL" &&
              "Review the order details, then approve or return it to draft."}
            {purchaseOrder.status === "APPROVED" &&
              "This order is approved and ready to be sent to the vendor."}
            {(purchaseOrder.status === "SENT" ||
              purchaseOrder.status === "PARTIALLY_RECEIVED") &&
              "Manage this purchase order or cancel its remaining commitment."}
          </p>
        </div>

        {purchaseOrder.status === "DRAFT" &&
          !purchaseOrder.revisionRequired && (
            <Button
              disabled={isPending}
              onClick={() =>
                void runAction(() =>
                  submitMutation.mutateAsync(purchaseOrder.id),
                )
              }
            >
              {submitMutation.isPending
                ? "Submitting..."
                : "Submit for approval"}
            </Button>
          )}

        {purchaseOrder.status === "PENDING_APPROVAL" && !showRejectForm && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={isPending || isCreator}
              onClick={() => setShowRejectForm(true)}
            >
              Reject
            </Button>
            <Button
              disabled={isPending || isCreator}
              onClick={() =>
                void runAction(() =>
                  approveMutation.mutateAsync(purchaseOrder.id),
                )
              }
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </div>
        )}

        {purchaseOrder.status === "APPROVED" && (
          <Button
            disabled={isPending}
            onClick={() =>
              void runAction(() => sendMutation.mutateAsync(purchaseOrder.id))
            }
          >
            {sendMutation.isPending ? "Sending..." : "Send to vendor"}
          </Button>
        )}

        {canCancel && !showCancelForm && (
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => {
              setActionError("");
              setShowCancelForm(true);
            }}
          >
            Cancel purchase order
          </Button>
        )}
      </div>

      {canCancel && showCancelForm && (
        <form onSubmit={handleCancel} className="mt-5 max-w-2xl space-y-3">
          <label
            htmlFor="cancellation-reason"
            className="block text-sm font-medium text-slate-700"
          >
            Cancellation reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="cancellation-reason"
            value={cancellationReason}
            onChange={(event) => {
              setCancellationReason(event.target.value);
              setActionError("");
            }}
            rows={3}
            maxLength={2000}
            required
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="Explain why this purchase order is being cancelled"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={isPending}>
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Confirm cancellation"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setShowCancelForm(false)}
            >
              Keep purchase order
            </Button>
          </div>
        </form>
      )}

      {purchaseOrder.status === "DRAFT" && (
        <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
          {policyQuery.data && (
            <p className="text-slate-600">
              Maximum PO value: KES {policyQuery.data.data.maxPoValueKes}
            </p>
          )}
          {exceedsLimit && (
            <p className="mt-2 text-amber-900" role="status">
              This PO is over the configured limit. The server will keep it as a
              draft and reject submission for approval.
            </p>
          )}
          {purchaseOrder.currency !== "KES" && (
            <p className="mt-2 text-amber-900" role="status">
              Submission is currently limited to KES purchase orders.
            </p>
          )}
          {policyQuery.isError && (
            <p className="mt-2 text-slate-600" role="status">
              The limit could not be loaded; submission is still validated by
              the server.
            </p>
          )}
        </div>
      )}

      {purchaseOrder.status === "PENDING_APPROVAL" && isCreator && (
        <p className="mt-3 text-sm text-amber-800" role="status">
          You created this purchase order and cannot approve or reject it.
        </p>
      )}

      {purchaseOrder.status === "PENDING_APPROVAL" && showRejectForm && (
        <form onSubmit={handleReject} className="mt-5 max-w-2xl space-y-3">
          <label
            htmlFor="rejection-comments"
            className="block text-sm font-medium text-slate-700"
          >
            Rejection comments
          </label>
          <textarea
            id="rejection-comments"
            value={comments}
            onChange={(event) => {
              setComments(event.target.value);
              setActionError("");
            }}
            rows={3}
            maxLength={2000}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="Optional reason for returning this order to draft"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={isPending}>
              {rejectMutation.isPending ? "Rejecting..." : "Confirm rejection"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setShowRejectForm(false)}
            >
              Keep pending
            </Button>
          </div>
        </form>
      )}

      {actionError && (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {actionSuccess && (
        <p
          className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {actionSuccess}
        </p>
      )}
    </Card>
  );
}

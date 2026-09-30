import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";

type Method = "CASH" | "CARD" | "GIFT_CARD";
type Register = { id: string; code: string; name: string; inventoryLocationId: string };
type SessionSummary = { id: string; registerCode: string; registerName: string; status: string; openedAt: string; openedBy: string; openingFloatMinor: number };
type TenderTotal = { saleMinor: number; refundMinor: number; openingMinor: number; expectedMinor: number; countedMinor: number | null; varianceMinor: number | null };
type Session = SessionSummary & {
  reconciliationStatus: string;
  closedAt: string | null;
  lastSnapshotAt: string | null;
  lastReconciliationDetails: { local?: unknown; source?: unknown; negativeExpectedMethods?: string[]; message?: string } | null;
  transactionCount: number;
  expectedTotals: Record<Method, TenderTotal>;
  submission: null | { id: string; submissionNumber: number; submittedBy: string; reconciliationStatus: string; varianceExplanations: Record<string, string> };
  transactions: Array<{ id: string; transactionId: string; direction: string; receiptNumber: string | null; occurredAt: string; tenders: Array<{ method: Method; amountMinor: number }> }>;
  decisions: Array<{ action: string; actorId: string; reason: string | null; createdAt: string }>;
};
type ListResponse<T> = { data: T[] };
const methods: Method[] = ["CASH", "CARD", "GIFT_CARD"];
const labels: Record<Method, string> = { CASH: "Cash", CARD: "Card", GIFT_CARD: "Gift card" };
const money = (minor: number) => `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseMinor = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
};

export function SalesAuditPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [countDraft, setCountDraft] = useState<{ key: string; values: Record<Method, string> } | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [reviewActor, setReviewActor] = useState(CURRENT_ACTOR_ID);
  const [reviewReason, setReviewReason] = useState("");
  const [error, setError] = useState("");

  const registersQuery = useQuery({ queryKey: ["sales-audit", "registers"], queryFn: () => apiRequest<ListResponse<Register>>(`${API_URLS.salesAudit}/registers`) });
  const sessionsQuery = useQuery({ queryKey: ["sales-audit", "sessions"], queryFn: () => apiRequest<ListResponse<SessionSummary>>(`${API_URLS.salesAudit}/sessions?limit=50`) });
  const sessions = sessionsQuery.data?.data ?? [];
  const effectiveRegisterId = registerId || registersQuery.data?.data[0]?.id || "";
  const chosenId = selectedId || sessions.find((item) => ["OPEN", "SUBMITTED", "EXCEPTION", "REJECTED"].includes(item.status))?.id || sessions[0]?.id || "";
  const detailQuery = useQuery({ queryKey: ["sales-audit", "session", chosenId], queryFn: () => apiRequest<{ data: Session }>(`${API_URLS.salesAudit}/sessions/${chosenId}`), enabled: Boolean(chosenId), refetchInterval: 10000 });
  const session = detailQuery.data?.data;
  const countDraftKey = session ? `${session.id}:${session.submission?.id ?? "draft"}` : "";
  const sessionCounts: Record<Method, string> = session ? {
    CASH: ((session.expectedTotals.CASH.countedMinor ?? 0) / 100).toFixed(2),
    CARD: ((session.expectedTotals.CARD.countedMinor ?? 0) / 100).toFixed(2),
    GIFT_CARD: ((session.expectedTotals.GIFT_CARD.countedMinor ?? 0) / 100).toFixed(2),
  } : { CASH: "0.00", CARD: "0.00", GIFT_CARD: "0.00" };
  const counts = countDraft?.key === countDraftKey ? countDraft.values : sessionCounts;

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["sales-audit"] }); };
  const openMutation = useMutation({
    mutationFn: () => apiRequest<{ data: Session }>(`${API_URLS.salesAudit}/sessions`, { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ registerId: effectiveRegisterId, openingFloatMinor: parseMinor(openingFloat) }) }),
    onSuccess: async (result) => { setSelectedId(result.data.id); setError(""); await refresh(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not open this register session."),
  });
  const submitMutation = useMutation({
    mutationFn: () => apiRequest<{ data: Session }>(`${API_URLS.salesAudit}/sessions/${chosenId}/submit`, { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ countedTotals: methods.map((method) => ({ method, amountMinor: parseMinor(counts[method]) })), varianceExplanations: explanations }) }),
    onSuccess: async () => { setError(""); await refresh(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not submit this close."),
  });
  const reconcileMutation = useMutation({
    mutationFn: () => apiRequest(`${API_URLS.salesAudit}/sessions/${chosenId}/reconcile`, { method: "POST", headers: { "x-actor-id": reviewActor }, body: JSON.stringify({}) }),
    onSuccess: async () => { setError(""); await refresh(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not reconcile this session."),
  });
  const approveMutation = useMutation({
    mutationFn: () => apiRequest(`${API_URLS.salesAudit}/sessions/${chosenId}/approve`, { method: "POST", headers: { "x-actor-id": reviewActor }, body: JSON.stringify({}) }),
    onSuccess: async () => { setError(""); await refresh(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not approve this close."),
  });
  const rejectMutation = useMutation({
    mutationFn: () => apiRequest(`${API_URLS.salesAudit}/sessions/${chosenId}/reject`, { method: "POST", headers: { "x-actor-id": reviewActor }, body: JSON.stringify({ reason: reviewReason }) }),
    onSuccess: async () => { setError(""); setReviewReason(""); await refresh(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not reject this close."),
  });

  const active = sessions.some((item) => ["OPEN", "SUBMITTED", "EXCEPTION", "REJECTED"].includes(item.status));
  const amountsValid = methods.every((method) => Number.isFinite(parseMinor(counts[method])));
  const explanationsValid = methods.every((method) => {
    if (!session) return true;
    const variance = parseMinor(counts[method]) - session.expectedTotals[method].expectedMinor;
    return variance === 0 || Boolean(explanations[method]?.trim());
  });
  const displayedError = error || (registersQuery.isError || sessionsQuery.isError || detailQuery.isError ? "Sales Audit is temporarily unavailable. Please try again in a moment. If the issue continues, contact your administrator." : "");

  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold text-[var(--app-ink)]">Sales Audit</h1>
      <p className="mt-1 text-sm text-[var(--app-muted)]">Reconcile recorded register tenders, submit drawer counts, and review close decisions.</p>
      <p className="mt-1 text-xs text-[var(--app-muted)]">Tender entries are recorded amounts; card and gift-card totals do not confirm processor settlement.</p>
    </header>
    {displayedError && <p role="alert" className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface-muted)] p-3 text-sm font-medium text-[var(--app-ink)]">{displayedError}</p>}

    {!active && <Card className="space-y-4 p-5">
      <div><h2 className="font-semibold text-[var(--app-ink)]">Open a register session</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Opening float is counted cash already in the drawer.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Register
          <Select value={effectiveRegisterId} onChange={(event) => setRegisterId(event.target.value)} disabled={!registersQuery.data?.data.length}>
            {(registersQuery.data?.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Opening cash float (KES)
          <Input value={openingFloat} inputMode="decimal" onChange={(event) => setOpeningFloat(event.target.value)} />
        </label>
      </div>
      <Button onClick={() => openMutation.mutate()} disabled={openMutation.isPending || !effectiveRegisterId || !Number.isFinite(parseMinor(openingFloat))}>{openMutation.isPending ? "Opening…" : "Open register"}</Button>
    </Card>}

    {sessions.length > 0 && <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-[var(--app-ink)]">Register sessions</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Select a session to review its transactions and tender reconciliation.</p></div>
        <Select className="max-w-sm" value={chosenId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Select register session">
          {sessions.map((item) => <option key={item.id} value={item.id}>{item.registerCode} · {item.status} · {new Date(item.openedAt).toLocaleString()}</option>)}
        </Select>
      </div>
      {session && <>
        <div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-semibold text-[var(--app-ink)]">{session.registerCode} · {session.registerName}</h3><Badge>{session.status}</Badge><Badge>{session.reconciliationStatus}</Badge></div>
        <p className="text-sm text-[var(--app-muted)]">Opened {new Date(session.openedAt).toLocaleString()} · Opening float {money(session.openingFloatMinor)} · {session.transactionCount} recorded transactions</p>
        {session.lastReconciliationDetails && <details className="rounded-lg border border-[var(--app-line)] p-3 text-sm"><summary className="cursor-pointer font-medium text-[var(--app-ink)]">Last Retail Sales comparison</summary><pre className="mt-2 overflow-x-auto text-xs text-[var(--app-muted)]">{JSON.stringify(session.lastReconciliationDetails, null, 2)}</pre></details>}
        <div className="overflow-x-auto rounded-lg border border-[var(--app-line)]">
          <table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs uppercase text-[var(--app-muted)]"><tr><th className="p-3">Tender</th><th className="p-3">Sales</th><th className="p-3">Refunds</th><th className="p-3">Expected</th><th className="p-3">Counted</th><th className="p-3">Variance</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{methods.map((method) => { const total = session.expectedTotals[method]; return <tr key={method}><th className="p-3 font-medium text-[var(--app-ink)]">{labels[method]}</th><td className="p-3">{money(total.saleMinor)}</td><td className="p-3">{money(total.refundMinor)}</td><td className="p-3 font-semibold">{money(total.expectedMinor)}</td><td className="p-3">{total.countedMinor === null ? "—" : money(total.countedMinor)}</td><td className={`p-3 font-semibold ${(total.varianceMinor ?? 0) === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{total.varianceMinor === null ? "—" : money(total.varianceMinor)}</td></tr>; })}</tbody></table>
        </div>

        {["OPEN", "REJECTED", "EXCEPTION"].includes(session.status) && <section className="space-y-3 border-t border-[var(--app-line)] pt-4">
          <h4 className="font-semibold text-[var(--app-ink)]">{session.status === "OPEN" ? "Submit drawer count" : "Submit corrected close"}</h4>
          <div className="grid gap-3 sm:grid-cols-3">{methods.map((method) => <label key={method} className="space-y-1 text-sm font-medium text-[var(--app-ink)]">{labels[method]} counted (KES)<Input inputMode="decimal" value={counts[method]} onChange={(event) => setCountDraft({ key: countDraftKey, values: { ...counts, [method]: event.target.value } })} /></label>)}</div>
          {methods.map((method) => { const variance = parseMinor(counts[method]) - session.expectedTotals[method].expectedMinor; return variance === 0 ? null : <label key={method} className="block space-y-1 text-sm font-medium text-[var(--app-ink)]">Explain {labels[method]} variance ({money(variance)})<Input value={explanations[method] ?? ""} onChange={(event) => setExplanations((old) => ({ ...old, [method]: event.target.value }))} /></label>; })}
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !amountsValid || !explanationsValid}>{submitMutation.isPending ? "Submitting…" : "Submit close for review"}</Button>
        </section>}

        {(session.status === "SUBMITTED" || session.status === "EXCEPTION") && <section className="space-y-3 border-t border-[var(--app-line)] pt-4">
          <h4 className="font-semibold text-[var(--app-ink)]">Manager review</h4>
          <p className="text-sm text-[var(--app-muted)]">Submitted by {session.submission?.submittedBy}. Recorded totals are not payment settlement.</p>
          <label className="block max-w-xl space-y-1 text-sm font-medium text-[var(--app-ink)]">Reviewing manager actor UUID <Input value={reviewActor} onChange={(event) => setReviewActor(event.target.value)} /></label>
          {session.reconciliationStatus !== "MATCHED" && <Button variant="secondary" onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending}>{reconcileMutation.isPending ? "Reconciling…" : "Retry Retail Sales reconciliation"}</Button>}
          <label className="block max-w-xl space-y-1 text-sm font-medium text-[var(--app-ink)]">Rejection reason (required to reject)<Input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2"><Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending || session.status !== "SUBMITTED" || session.reconciliationStatus !== "MATCHED" || reviewActor === session.submission?.submittedBy}>{approveMutation.isPending ? "Approving…" : "Approve close"}</Button><Button variant="danger" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !reviewReason.trim() || reviewActor === session.submission?.submittedBy}>{rejectMutation.isPending ? "Rejecting…" : "Reject close"}</Button></div>
        </section>}

        <section className="border-t border-[var(--app-line)] pt-4"><h4 className="font-semibold text-[var(--app-ink)]">Recorded transactions</h4>{session.transactions.length === 0 ? <p className="mt-2 text-sm text-[var(--app-muted)]">No sale or refund events have arrived for this session yet.</p> : <ul className="mt-2 divide-y divide-[var(--app-line)]">{session.transactions.map((transaction) => <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><strong>{transaction.receiptNumber ?? transaction.transactionId}</strong><span className="ml-2 text-[var(--app-muted)]">{transaction.direction} · {new Date(transaction.occurredAt).toLocaleString()}</span></span><span>{transaction.tenders.map((tender) => `${labels[tender.method]} ${money(tender.amountMinor)}`).join(" · ")}</span></li>)}</ul>}</section>
        {session.decisions.length > 0 && <section className="border-t border-[var(--app-line)] pt-4"><h4 className="font-semibold text-[var(--app-ink)]">Review history</h4><ul className="mt-2 space-y-2 text-sm">{session.decisions.map((decision, index) => <li key={`${decision.createdAt}-${index}`}>{decision.action} by {decision.actorId} · {new Date(decision.createdAt).toLocaleString()}{decision.reason ? ` · ${decision.reason}` : ""}</li>)}</ul></section>}
      </>}
    </Card>}
    {!sessions.length && !sessionsQuery.isLoading && <p className="text-sm text-[var(--app-muted)]">No register sessions yet.</p>}
  </div>;
}

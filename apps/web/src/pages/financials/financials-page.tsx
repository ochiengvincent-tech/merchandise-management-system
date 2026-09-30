import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { API_URLS } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { CURRENT_ACTOR_ID } from "../../lib/api/config";
import { SupplierInvoicesPanel } from "./supplier-invoices-panel";
import { LedgerOperationsPanel } from "./ledger-operations-panel";

type ReportLine = { code: string; name: string; accountType: string; debitMinor: string; creditMinor: string; netMinor?: string; balanceMinor?: string };
type TrialBalance = { data: ReportLine[]; totals: { debitMinor: string; creditMinor: string; balanced: boolean } };
type IncomeStatement = { data: ReportLine[]; from: string; to: string; currency: string };
type Exceptions = { data: Array<{ eventId: string; eventType: string; status: string; lastError: string | null; receivedAt: string }> };
type Periods = { data: Array<{ periodKey: string; status: string; startsOn: string; endsOn: string }> };
const money = (minor: string | number) => `KES ${(Number(minor) / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = new Date();
const from = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

export function FinancialsPage() {
  const trial = useQuery({ queryKey: ["financials", "trial-balance"], queryFn: () => apiRequest<TrialBalance>(`${API_URLS.financials}/reports/trial-balance?currency=KES`) });
  const income = useQuery({ queryKey: ["financials", "income-statement", from, to], queryFn: () => apiRequest<IncomeStatement>(`${API_URLS.financials}/reports/income-statement?from=${from}&to=${to}&currency=KES`) });
  const exceptions = useQuery({ queryKey: ["financials", "exceptions"], queryFn: () => apiRequest<Exceptions>(`${API_URLS.financials}/posting-exceptions?status=EXCEPTION&limit=10`) });
  const periods = useQuery({ queryKey: ["financials", "periods"], queryFn: () => apiRequest<Periods>(`${API_URLS.financials}/periods`) });
  const inventoryValue = useQuery({ queryKey: ["financials", "inventory-value"], queryFn: () => apiRequest<{ data: Array<{ locationId: string | null; productId: string | null; carryingValueMinor: string }>; totalMinor: string; asOf: string }>(API_URLS.financials + "/reports/inventory-value") });
  const cache = useQueryClient();
  const [reopenReason, setReopenReason] = useState("");
  const retryEvent = useMutation({
    mutationFn: (eventId: string) => apiRequest(API_URLS.financials + "/posting-exceptions/" + eventId + "/retry", { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify({}) }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["financials"] }); },
  });
  const periodAction = useMutation({
    mutationFn: ({ periodKey, action }: { periodKey: string; action: "close" | "reopen" }) => apiRequest(API_URLS.financials + "/periods/" + periodKey + "/" + action, { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify(action === "reopen" ? { reason: reopenReason } : {}) }),
    onSuccess: async () => { setReopenReason(""); await cache.invalidateQueries({ queryKey: ["financials", "periods"] }); },
  });
  const error = [trial.error, income.error, exceptions.error, periods.error, inventoryValue.error].find(Boolean);
  const statementRows = income.data?.data ?? [];
  const revenue = statementRows.filter((row) => row.accountType === "REVENUE").reduce((sum, row) => sum + BigInt(row.balanceMinor ?? "0"), 0n);
  const expenses = statementRows.filter((row) => row.accountType === "EXPENSE").reduce((sum, row) => sum + BigInt(row.balanceMinor ?? "0"), 0n);
  const sections: Array<[string, string]> = [["Revenue", revenue.toString()], ["Expenses", expenses.toString()], ["Net income", (revenue - expenses).toString()]];
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold text-[var(--app-ink)]">Financials</h1><p className="mt-1 text-sm text-[var(--app-muted)]">Review ledger balances, operating results, posting exceptions, and accounting periods.</p><p className="mt-1 text-xs text-[var(--app-muted)]">KES reporting · Figures include only transactions posted to the general ledger.</p></header>
    {error && <p role="alert" className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-ink)]">Financial data is temporarily unavailable. Please try again shortly. If the issue continues, contact your administrator.</p>}
    <div className="grid gap-4 md:grid-cols-3">{sections.map(([label, value]) => <Card key={label} className="p-5"><p className="text-sm text-[var(--app-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--app-ink)]">{money(value)}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{from} – {to}</p></Card>)}</div>
    <Card className="overflow-hidden"><div className="border-b border-[var(--app-line)] p-5"><h2 className="font-semibold text-[var(--app-ink)]">Inventory carrying value</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Posted inventory-asset journal value through {inventoryValue.data?.asOf ?? "today"}.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]"><tr><th className="p-3">Location</th><th className="p-3">Product</th><th className="p-3 text-right">Carrying value</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{(inventoryValue.data?.data ?? []).map((row, index) => <tr key={row.locationId + ":" + row.productId + ":" + index}><td className="p-3 text-[var(--app-ink)]">{row.locationId ?? "Unassigned"}</td><td className="p-3 text-[var(--app-ink)]">{row.productId ?? "Unassigned"}</td><td className="p-3 text-right text-[var(--app-ink)]">{money(row.carryingValueMinor)}</td></tr>)}</tbody></table></div><div className="border-t border-[var(--app-line)] p-4 text-sm font-semibold text-[var(--app-ink)]">Total {money(inventoryValue.data?.totalMinor ?? "0")}</div></Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="overflow-hidden"><div className="border-b border-[var(--app-line)] p-5"><h2 className="font-semibold text-[var(--app-ink)]">Trial balance</h2><p className="mt-1 text-sm text-[var(--app-muted)]">All posted journal activity in KES.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]"><tr><th className="p-3">Account</th><th className="p-3 text-right">Debits</th><th className="p-3 text-right">Credits</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{(trial.data?.data ?? []).map((row) => <tr key={row.code}><th className="p-3 font-medium text-[var(--app-ink)]">{row.code} · {row.name}</th><td className="p-3 text-right text-[var(--app-ink)]">{money(row.debitMinor)}</td><td className="p-3 text-right text-[var(--app-ink)]">{money(row.creditMinor)}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-[var(--app-line)] p-4 text-sm"><span className="font-medium text-[var(--app-ink)]">Debits {money(trial.data?.totals.debitMinor ?? "0")} · Credits {money(trial.data?.totals.creditMinor ?? "0")}</span><Badge variant={trial.data?.totals.balanced ? "success" : "warning"}>{trial.data?.totals.balanced ? "Balanced" : "Out of balance"}</Badge></div></Card>
      <div className="space-y-6"><Card className="overflow-hidden"><div className="border-b border-[var(--app-line)] p-5"><h2 className="font-semibold text-[var(--app-ink)]">Posting exceptions</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Source entries that need finance review.</p></div>{!exceptions.data?.data.length ? <p className="p-5 text-sm text-[var(--app-muted)]">No posting exceptions.</p> : <ul className="divide-y divide-[var(--app-line)]">{exceptions.data.data.map((item) => <li key={item.eventId} className="p-4"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[var(--app-ink)]">{item.eventType}</span><Badge variant="warning">{item.status}</Badge></div><p className="mt-1 text-xs text-[var(--app-muted)]">{item.lastError ?? "Needs review"}</p><Button variant="secondary" onClick={() => retryEvent.mutate(item.eventId)} disabled={retryEvent.isPending}>Retry posting</Button></li>)}</ul>}</Card>
      <Card className="overflow-hidden"><div className="border-b border-[var(--app-line)] p-5"><h2 className="font-semibold text-[var(--app-ink)]">Accounting periods</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Recent posting periods and their status.</p></div>{!periods.data?.data.length ? <p className="p-5 text-sm text-[var(--app-muted)]">Periods appear when ledger activity is posted.</p> : <ul className="divide-y divide-[var(--app-line)]">{periods.data.data.slice(0, 8).map((item) => <li key={item.periodKey} className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="text-sm font-medium text-[var(--app-ink)]">{item.periodKey}</span><Badge variant={item.status === "OPEN" ? "info" : "default"}>{item.status}</Badge>{item.status === "OPEN" ? <Button variant="secondary" onClick={() => periodAction.mutate({ periodKey: item.periodKey, action: "close" })} disabled={periodAction.isPending}>Close period</Button> : <div className="flex items-center gap-2"><Input className="max-w-xs" aria-label={"Reason to reopen " + item.periodKey} placeholder="Reason to reopen" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} /><Button variant="secondary" onClick={() => periodAction.mutate({ periodKey: item.periodKey, action: "reopen" })} disabled={periodAction.isPending || reopenReason.trim().length < 5}>Reopen</Button></div>}</li>)}</ul>}</Card></div>
    </div>
    <LedgerOperationsPanel />
    <SupplierInvoicesPanel />
  </div>;
}

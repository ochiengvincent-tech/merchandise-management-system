import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";

type Account = { id: string; code: string; name: string; accountType: string; normalBalance: string; active: boolean; currency: string };
type Mapping = { mappingKey: string; accountCode: string; accountName: string };
type Journal = { id: string; journalNumber: string; sourceType: string; accountingDate: string; description: string; debitMinor: string; creditMinor: string };
type JournalDetail = Journal & { reversalOfId: string | null; lines: Array<{ id: string; accountCode: string; debitMinor: string; creditMinor: string; memo: string | null }> };
const mappingRequirements: Record<string, { accountType: string; normalBalance: string }> = {
  TENDER_CASH: { accountType: "ASSET", normalBalance: "DEBIT" }, TENDER_CARD: { accountType: "ASSET", normalBalance: "DEBIT" }, TENDER_GIFT_CARD: { accountType: "ASSET", normalBalance: "DEBIT" }, INVENTORY_ASSET: { accountType: "ASSET", normalBalance: "DEBIT" }, INPUT_TAX: { accountType: "ASSET", normalBalance: "DEBIT" },
  GRNI: { accountType: "LIABILITY", normalBalance: "CREDIT" }, ACCOUNTS_PAYABLE: { accountType: "LIABILITY", normalBalance: "CREDIT" }, SALES_TAX_PAYABLE: { accountType: "LIABILITY", normalBalance: "CREDIT" }, OPENING_EQUITY: { accountType: "EQUITY", normalBalance: "CREDIT" }, SALES_REVENUE: { accountType: "REVENUE", normalBalance: "CREDIT" }, SALES_RETURNS: { accountType: "REVENUE", normalBalance: "DEBIT" }, COGS: { accountType: "EXPENSE", normalBalance: "DEBIT" }, INVENTORY_VARIANCE: { accountType: "EXPENSE", normalBalance: "DEBIT" },
};
const money = (value: string) => "KES " + (Number(value) / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LedgerOperationsPanel() {
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("ASSET");
  const [normalBalance, setNormalBalance] = useState("DEBIT");
  const accounts = useQuery({ queryKey: ["financials", "accounts"], queryFn: () => apiRequest<{ data: Account[] }>(API_URLS.financials + "/accounts") });
  const mappings = useQuery({ queryKey: ["financials", "mappings"], queryFn: () => apiRequest<{ data: Mapping[] }>(API_URLS.financials + "/posting-mappings") });
  const journals = useQuery({ queryKey: ["financials", "journals"], queryFn: () => apiRequest<{ data: Journal[] }>(API_URLS.financials + "/journals?limit=15") });
  const detail = useQuery({ queryKey: ["financials", "journal", selectedId], queryFn: () => apiRequest<{ data: JournalDetail }>(API_URLS.financials + "/journals/" + selectedId), enabled: Boolean(selectedId) });
  const updateMapping = useMutation({
    mutationFn: ({ key, accountCode }: { key: string; accountCode: string }) => apiRequest(API_URLS.financials + "/posting-mappings/" + key, { method: "PUT", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify({ accountCode }) }),
    onSuccess: async () => { setMessage("Posting mapping updated and audited."); await cache.invalidateQueries({ queryKey: ["financials", "mappings"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not update the posting mapping."),
  });
  const createAccount = useMutation({
    mutationFn: () => apiRequest(API_URLS.financials + "/accounts", { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify({ code, name, accountType: type, normalBalance, currency: "KES" }) }),
    onSuccess: async () => { setCode(""); setName(""); setMessage("Account created."); await cache.invalidateQueries({ queryKey: ["financials", "accounts"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not create the account."),
  });
  const reverse = useMutation({
    mutationFn: () => apiRequest(API_URLS.financials + "/journals/" + selectedId + "/reverse", { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify({ reason }) }),
    onSuccess: async () => { setReason(""); setMessage("Reversal journal posted."); await cache.invalidateQueries({ queryKey: ["financials"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not reverse this journal."),
  });

  return <div className="space-y-6">
    {message && <p role="status" className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-ink)]">{message}</p>}
    <Card className="space-y-4 p-5">
      <div><h2 className="font-semibold text-[var(--app-ink)]">Chart of accounts and posting mappings</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Only active KES accounts are available to the initial chart.</p></div>
      <div className="grid gap-4 md:grid-cols-4"><label className="space-y-1 text-sm font-medium text-[var(--app-ink)]">Account code<Input value={code} onChange={(e) => setCode(e.target.value)} /></label><label className="space-y-1 text-sm font-medium text-[var(--app-ink)]">Account name<Input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="space-y-1 text-sm font-medium text-[var(--app-ink)]">Type<Select value={type} onChange={(e) => { setType(e.target.value); setNormalBalance(e.target.value === "ASSET" || e.target.value === "EXPENSE" ? "DEBIT" : "CREDIT"); }}>{["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((item) => <option key={item}>{item}</option>)}</Select></label><div className="flex items-end"><Button onClick={() => createAccount.mutate()} disabled={createAccount.isPending || !/^\d{3,10}$/.test(code) || name.trim().length < 2}>{createAccount.isPending ? "Creating…" : "Add account"}</Button></div></div>
      <div className="grid gap-5 xl:grid-cols-2"><div className="overflow-x-auto rounded-lg border border-[var(--app-line)]"><table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]"><tr><th className="p-3">Code</th><th className="p-3">Account</th><th className="p-3">Type</th><th className="p-3">Balance</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{(accounts.data?.data ?? []).map((item) => <tr key={item.id}><td className="p-3 text-[var(--app-ink)]">{item.code}</td><th className="p-3 font-medium text-[var(--app-ink)]">{item.name}</th><td className="p-3 text-[var(--app-muted)]">{item.accountType}</td><td className="p-3 text-[var(--app-muted)]">{item.normalBalance}</td></tr>)}</tbody></table></div>
      <div className="space-y-2">{(mappings.data?.data ?? []).map((item) => <label key={item.mappingKey} className="grid gap-2 text-sm sm:grid-cols-[1fr_1.4fr] sm:items-center"><span className="font-medium text-[var(--app-ink)]">{item.mappingKey}</span><Select value={item.accountCode} onChange={(e) => updateMapping.mutate({ key: item.mappingKey, accountCode: e.target.value })}>{(accounts.data?.data ?? []).filter((account) => { const expected = mappingRequirements[item.mappingKey]; return account.active && expected && account.accountType === expected.accountType && account.normalBalance === expected.normalBalance && account.currency === "KES"; }).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</Select></label>)}</div></div>
    </Card>
    <Card className="overflow-hidden"><div className="border-b border-[var(--app-line)] p-5"><h2 className="font-semibold text-[var(--app-ink)]">Journal browser</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Posted journals are immutable. Corrections append a linked reversal.</p></div><div className="grid xl:grid-cols-2"><div className="divide-y divide-[var(--app-line)]">{(journals.data?.data ?? []).map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[var(--app-surface-muted)]"><span><strong className="block text-[var(--app-ink)]">{item.journalNumber}</strong><span className="text-xs text-[var(--app-muted)]">{item.sourceType} · {item.accountingDate}</span></span><span className="text-right text-sm text-[var(--app-ink)]">{money(item.debitMinor)}</span></button>)}</div>{detail.data?.data && <div className="space-y-3 border-t border-[var(--app-line)] p-5 xl:border-l xl:border-t-0"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-[var(--app-ink)]">{detail.data.data.journalNumber}</h3><Badge>{detail.data.data.sourceType}</Badge></div><p className="text-sm text-[var(--app-muted)]">{detail.data.data.description}</p><ul className="divide-y divide-[var(--app-line)]">{detail.data.data.lines.map((line) => <li key={line.id} className="flex justify-between gap-3 py-2 text-sm"><span className="text-[var(--app-ink)]">{line.accountCode} · {line.memo}</span><span className="text-right text-[var(--app-muted)]">Dr {money(line.debitMinor)}<br />Cr {money(line.creditMinor)}</span></li>)}</ul><label className="block space-y-1 text-sm font-medium text-[var(--app-ink)]">Reason to reverse<Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label><Button variant="danger" onClick={() => reverse.mutate()} disabled={reverse.isPending || reason.trim().length < 5 || Boolean(detail.data.data.reversalOfId)}>{reverse.isPending ? "Reversing…" : "Append reversal journal"}</Button></div>}</div></Card>
  </div>;
}

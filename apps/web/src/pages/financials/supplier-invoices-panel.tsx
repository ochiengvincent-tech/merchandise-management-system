import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID, SYSTEM_ACTOR_ID } from "../../lib/api/config";

type PurchaseOrder = { id: string; poNumber: string; vendorId: string; currency: string; status: string; approvedAt: string | null; lines: Array<{ id: string; productId: string; unitPrice: string; quantityOrdered: number; quantityReceived: number }> };
type ReceiptLine = { id: string; productId: string; purchaseOrderLineId: string | null; quantityAccepted: number };
type Receipt = { id: string; grnNumber: string; lines: ReceiptLine[] };
type DraftLine = { purchaseOrderId: string; purchaseOrderLineId: string; goodsReceiptId: string; goodsReceiptLineId: string; productId: string; quantity: number; unitPriceMinor: string; taxMinor: string; lineTotalMinor: string };
type Invoice = { id: string; invoiceNumber: string; invoiceDate: string; status: string; totalMinor: string; exceptionReason: string | null; journalId: string | null };
const minor = (amount: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
};
const money = (amount: string) => "KES " + (Number(amount) / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SupplierInvoicesPanel() {
  const cache = useQueryClient();
  const [poId, setPoId] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [tax, setTax] = useState("0.00");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reviewer, setReviewer] = useState(SYSTEM_ACTOR_ID);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [message, setMessage] = useState("");
  const pos = useQuery({ queryKey: ["financials", "invoice-pos"], queryFn: () => apiRequest<{ data: PurchaseOrder[] }>(API_URLS.procurement + "/purchase-orders?status=SENT,PARTIALLY_RECEIVED,COMPLETED&limit=100") });
  const poListItem = pos.data?.data.find((item) => item.id === poId);
  const poDetail = useQuery({ queryKey: ["financials", "invoice-po", poId], queryFn: () => apiRequest<{ data: PurchaseOrder }>(API_URLS.procurement + "/purchase-orders/" + poId), enabled: Boolean(poId) });
  const po = poDetail.data?.data ?? poListItem;
  const receipts = useQuery({ queryKey: ["financials", "invoice-receipts", poId], queryFn: () => apiRequest<{ data: Receipt[] }>(API_URLS.receiving + "/receipts?purchaseOrderId=" + poId + "&limit=100"), enabled: Boolean(poId) });
  const receipt = receipts.data?.data.find((item) => item.id === receiptId);
  const receiptLine = receipt?.lines.find((item) => item.id === lineId);
  const poLine = po?.lines.find((item) => item.id === receiptLine?.purchaseOrderLineId);
  const invoiceList = useQuery({ queryKey: ["financials", "supplier-invoices"], queryFn: () => apiRequest<{ data: Invoice[] }>(API_URLS.financials + "/supplier-invoices?limit=50") });
  let taxError = "";
  try { minor(tax); } catch (error) { taxError = error instanceof Error ? error.message : "Enter a valid tax amount."; }

  const capture = useMutation({
    mutationFn: async () => {
      if (!po || draftLines.length === 0) throw new Error("Add at least one accepted receipt line.");
      if (!po.approvedAt || po.currency.trim() !== "KES") throw new Error("Only approved KES purchase orders are supported.");
      const taxTotal = draftLines.reduce((sum, line) => sum + BigInt(line.taxMinor), 0n).toString();
      const totalMinor = draftLines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n).toString();
      const result = await apiRequest<{ data: Invoice }>(API_URLS.financials + "/supplier-invoices", {
        method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ vendorId: po.vendorId, invoiceNumber: number, invoiceDate: date, currency: "KES", taxMinor: taxTotal, totalMinor, lines: draftLines }),
      });
      await apiRequest(API_URLS.financials + "/supplier-invoices/" + result.data.id + "/match", { method: "POST", headers: { "x-actor-id": CURRENT_ACTOR_ID }, body: JSON.stringify({}) });
    },
    onSuccess: async () => { setMessage("Invoice captured and matched to the PO and accepted receipt."); setNumber(""); setDraftLines([]); await cache.invalidateQueries({ queryKey: ["financials"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not capture the invoice."),
  });
  const invoiceAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "match" | "approve" }) => apiRequest(API_URLS.financials + "/supplier-invoices/" + id + "/" + action, { method: "POST", headers: { "x-actor-id": action === "approve" ? reviewer : CURRENT_ACTOR_ID }, body: JSON.stringify({}) }),
    onSuccess: async () => { setMessage("Invoice status updated."); await cache.invalidateQueries({ queryKey: ["financials"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not update invoice."),
  });

  return <Card className="space-y-5 p-5">
    <div><h2 className="font-semibold text-[var(--app-ink)]">Supplier invoices</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Capture against an approved PO and accepted GRN. Posting records an amount owed; it does not record payment.</p></div>
    {message && <p role="status" className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-ink)]">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Purchase order<Select value={poId} onChange={(e) => { setPoId(e.target.value); setReceiptId(""); setLineId(""); setDraftLines([]); }}><option value="">Choose PO</option>{(pos.data?.data ?? []).filter((item) => item.approvedAt).map((item) => <option key={item.id} value={item.id}>{item.poNumber} · {item.status}</option>)}</Select></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Accepted goods receipt<Select value={receiptId} onChange={(e) => { setReceiptId(e.target.value); setLineId(""); }} disabled={!poId}><option value="">Choose GRN</option>{(receipts.data?.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.grnNumber}</option>)}</Select></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Received item<Select value={lineId} onChange={(e) => setLineId(e.target.value)} disabled={!receiptId}><option value="">Choose line</option>{(receipt?.lines ?? []).filter((item) => item.purchaseOrderLineId && po?.lines.some((candidate) => candidate.id === item.purchaseOrderLineId)).map((item) => <option key={item.id} value={item.id}>{po?.lines.find((candidate) => candidate.id === item.purchaseOrderLineId)?.productId} · accepted {item.quantityAccepted}</option>)}</Select></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Invoice number<Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={100} /></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Invoice date<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Quantity (max {receiptLine?.quantityAccepted ?? 0})<Input type="number" min={1} max={receiptLine?.quantityAccepted ?? 0} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
      <label className="space-y-1.5 text-sm font-medium text-[var(--app-ink)]">Invoice line tax (KES)<Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={Boolean(taxError)} /></label>
    </div>
    {poLine && <p className="text-sm text-[var(--app-muted)]">Approved PO unit price: {money(minor(poLine.unitPrice))} · Vendor {po?.vendorId}</p>}
    {taxError && <p className="text-sm text-[var(--app-muted)]">{taxError}</p>}
    <Button variant="secondary" onClick={() => {
      if (!po || !receipt || !receiptLine || !poLine) { setMessage("Choose a purchase order and accepted receipt line first."); return; }
      const qty = Number(quantity);
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > receiptLine.quantityAccepted) { setMessage("Quantity must be within the accepted receipt amount."); return; }
      if (!po.approvedAt || po.currency.trim() !== "KES") { setMessage("Only approved KES purchase orders are supported."); return; }
      if (draftLines.some((line) => line.goodsReceiptLineId === receiptLine.id)) { setMessage("This receipt line is already on the invoice."); return; }
      try {
        const unitPriceMinor = minor(poLine.unitPrice);
        const taxMinor = minor(tax);
        const lineTotalMinor = (BigInt(unitPriceMinor) * BigInt(qty) + BigInt(taxMinor)).toString();
        setDraftLines((items) => [...items, { purchaseOrderId: poId, purchaseOrderLineId: poLine.id, goodsReceiptId: receiptId, goodsReceiptLineId: receiptLine.id, productId: receiptLine.productId, quantity: qty, unitPriceMinor, taxMinor, lineTotalMinor }]);
        setMessage("");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Check the line amounts."); }
    }} disabled={!poId || !receiptId || !lineId || Boolean(taxError)}>Add invoice line</Button>
    {draftLines.length > 0 && <div className="overflow-x-auto rounded-lg border border-[var(--app-line)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]"><tr><th className="p-3">Receipt line</th><th className="p-3">Quantity</th><th className="p-3">Line total</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{draftLines.map((line) => <tr key={line.goodsReceiptLineId}><td className="p-3 text-[var(--app-ink)]">{line.productId} · {line.goodsReceiptId.slice(0, 8)}</td><td className="p-3 text-[var(--app-ink)]">{line.quantity}</td><td className="p-3 text-[var(--app-ink)]">{money(line.lineTotalMinor)}</td><td className="p-3"><Button variant="secondary" onClick={() => setDraftLines((items) => items.filter((item) => item.goodsReceiptLineId !== line.goodsReceiptLineId))}>Remove</Button></td></tr>)}</tbody></table></div>}
    <Button onClick={() => { setMessage(""); capture.mutate(); }} disabled={capture.isPending || !poId || !draftLines.length || !number.trim() || !date}>{capture.isPending ? "Saving invoice…" : "Capture and match invoice"}</Button>
    <div className="border-t border-[var(--app-line)] pt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-[var(--app-ink)]">Recent invoices</h3><p className="mt-1 text-sm text-[var(--app-muted)]">Approval must use an actor ID different from the creator.</p></div><label className="w-full max-w-sm space-y-1 text-xs text-[var(--app-muted)]">Approver actor UUID<Input value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></label></div>
      {!invoiceList.data?.data.length ? <p className="text-sm text-[var(--app-muted)]">No supplier invoices recorded.</p> : <div className="overflow-x-auto rounded-lg border border-[var(--app-line)]"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]"><tr><th className="p-3">Invoice</th><th className="p-3">Date</th><th className="p-3">Total</th><th className="p-3">State</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-[var(--app-line)]">{invoiceList.data.data.map((invoice) => <tr key={invoice.id}><th className="p-3 font-medium text-[var(--app-ink)]">{invoice.invoiceNumber}</th><td className="p-3 text-[var(--app-ink)]">{invoice.invoiceDate}</td><td className="p-3 text-[var(--app-ink)]">{money(invoice.totalMinor)}</td><td className="p-3"><Badge variant={invoice.status === "POSTED" ? "success" : invoice.status === "EXCEPTION" ? "warning" : "default"}>{invoice.status}</Badge>{invoice.exceptionReason && <p className="mt-1 max-w-xs text-xs text-[var(--app-muted)]">{invoice.exceptionReason}</p>}</td><td className="p-3">{invoice.status === "DRAFT" || invoice.status === "EXCEPTION" ? <Button variant="secondary" onClick={() => invoiceAction.mutate({ id: invoice.id, action: "match" })} disabled={invoiceAction.isPending}>Retry match</Button> : invoice.status === "MATCHED" ? <Button onClick={() => invoiceAction.mutate({ id: invoice.id, action: "approve" })} disabled={invoiceAction.isPending || !reviewer || reviewer === CURRENT_ACTOR_ID}>Approve and post</Button> : invoice.journalId ? <span className="text-xs text-[var(--app-muted)]">Journal {invoice.journalId}</span> : "—"}</td></tr>)}</tbody></table></div>}
    </div>
  </Card>;
}

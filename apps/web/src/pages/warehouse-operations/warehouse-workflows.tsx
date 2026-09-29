import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";
import { apiRequest } from "../../lib/api/client";

type Bin = { id: string; code: string; name: string; binType: string; status: string; systemManaged: boolean };
type StockRow = { balanceId: string; binId: string; binCode: string; binName: string; binType: string; productId: string; disposition: "SELLABLE" | "QUARANTINED" | "DISCREPANCY"; quantity: number; availableQuantity: number };
type Task = { id: string; goodsReceiptId: string; locationId: string; status: "OPEN" | "IN_PROGRESS" | "COMPLETED"; grnNumber: string; purchaseOrderId: string; receivedAt: string };
type TaskLine = { id: string; productId: string; quantityAccepted: number; quantityPlaced: number; quantityRemaining: number };
type ApiList<T> = { data: T[] };
const warehouse = API_URLS.warehouse;
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const feedback = (message: string, success = false) => <p role={success ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${success ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"}`}>{message}</p>;

export function WarehouseBinsSection({ locationId }: { locationId: string }) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [binType, setBinType] = useState("STORAGE");
  const [selectedBinId, setSelectedBinId] = useState("");
  const binsQuery = useQuery({ queryKey: ["warehouse", "bins", locationId], queryFn: () => apiRequest<ApiList<Bin>>(`${warehouse}/locations/${locationId}/bins`) });
  const stockQuery = useQuery({ queryKey: ["warehouse", "bin-stock", selectedBinId], queryFn: () => apiRequest<{ data: { bin: Bin; balances: Array<{ productId: string; disposition: string; quantity: number; reservedQuantity: number }> } }>(`${warehouse}/bins/${selectedBinId}`), enabled: Boolean(selectedBinId) });
  const createBin = useMutation({
    mutationFn: () => apiRequest(`${warehouse}/locations/${locationId}/bins`, { method: "POST", body: JSON.stringify({ code, name, binType, actorId: CURRENT_ACTOR_ID }) }),
    onSuccess: async () => { setCode(""); setName(""); await client.invalidateQueries({ queryKey: ["warehouse", "bins", locationId] }); },
  });
  return <div className="space-y-5">
    <Card className="p-5"><h2 className="font-semibold text-slate-950">Create a bin</h2><p className="mt-1 text-sm text-slate-500">Create storage or quarantine destinations for this location.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createBin.mutate(); }}>
        <Input aria-label="Bin code" placeholder="Bin code" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={50} />
        <Input aria-label="Bin name" placeholder="Bin name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} />
        <Select aria-label="Bin type" value={binType} onChange={(event) => setBinType(event.target.value)}><option value="STORAGE">Storage</option><option value="PICK_FACE">Pick face</option><option value="QUARANTINE">Quarantine</option></Select>
        <Button type="submit" disabled={createBin.isPending}>{createBin.isPending ? "Creating…" : "Create bin"}</Button>
      </form>
      {createBin.isError && <div className="mt-3">{feedback(errorText(createBin.error))}</div>}
      {createBin.isSuccess && <div className="mt-3">{feedback("Bin created.", true)}</div>}
    </Card>
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-200 p-4 dark:border-slate-700"><h2 className="font-semibold text-slate-950 dark:text-white">Location bins</h2></div>
      {binsQuery.isLoading ? <p className="p-5 text-sm text-slate-500">Loading bins…</p> : binsQuery.isError ? <div className="p-5">{feedback(errorText(binsQuery.error))}</div> : (binsQuery.data?.data.length ?? 0) === 0 ? <p className="p-5 text-sm text-slate-500">No bins have been created.</p> : <div className="divide-y divide-slate-200 dark:divide-slate-700">{binsQuery.data?.data.map((bin) => <div className="flex flex-wrap items-center justify-between gap-3 p-4" key={bin.id}><div><p className="font-medium text-slate-900 dark:text-slate-100">{bin.code} · {bin.name}</p><p className="mt-1 text-sm text-slate-500">{bin.binType.replaceAll("_", " ")}</p></div><div className="flex items-center gap-3"><Badge>{bin.status}{bin.systemManaged ? " · SYSTEM" : ""}</Badge><Button variant="secondary" onClick={() => setSelectedBinId(selectedBinId === bin.id ? "" : bin.id)}>{selectedBinId === bin.id ? "Hide stock" : "View stock"}</Button></div>{selectedBinId === bin.id && <div className="w-full rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">{stockQuery.isLoading ? <p className="text-sm text-slate-500">Loading balance…</p> : stockQuery.isError ? <p className="text-sm text-red-600">Could not load this bin’s stock.</p> : stockQuery.data?.data.balances.length ? <ul className="space-y-2">{stockQuery.data.data.balances.map((balance) => <li key={`${balance.productId}-${balance.disposition}`} className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-700 dark:text-slate-200">Product {balance.productId} · {balance.disposition}</span><span className="font-medium text-slate-900 dark:text-white">{balance.quantity} units · {balance.reservedQuantity} reserved</span></li>)}</ul> : <p className="text-sm text-slate-500">This bin has no stock balances.</p>}</div>}</div>)}</div>}
    </Card>
  </div>;
}

export function WarehousePutawaySection({ locationId, bins }: { locationId: string; bins: Bin[] }) {
  const client = useQueryClient();
  const [selectedTask, setSelectedTask] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const tasksQuery = useQuery({ queryKey: ["warehouse", "putaway-all", locationId], queryFn: async () => {
    const [open, active] = await Promise.all(["OPEN", "IN_PROGRESS"].map((status) => apiRequest<ApiList<Task>>(`${warehouse}/putaway-tasks?locationId=${locationId}&status=${status}`)));
    return [...open.data, ...active.data];
  } });
  const taskQuery = useQuery({ queryKey: ["warehouse", "putaway-detail", selectedTask], queryFn: () => apiRequest<{ data: { lines: TaskLine[] } }>(`${warehouse}/putaway-tasks/${selectedTask}`), enabled: Boolean(selectedTask) });
  const putaway = useMutation({
    mutationFn: (input: { taskId: string; lineId: string; destinationBinId: string; quantity: number }) => apiRequest(`${warehouse}/putaway-tasks/${input.taskId}/lines/${input.lineId}/putaway`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ destinationBinId: input.destinationBinId, quantity: input.quantity, actorId: CURRENT_ACTOR_ID }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["warehouse"] }); },
  });
  const destinationsAvailable = bins.filter((bin) => bin.status === "ACTIVE" && ["STORAGE", "PICK_FACE"].includes(bin.binType));
  return <Card className="space-y-4 p-5"><div><h2 className="font-semibold text-slate-950">Putaway queue</h2><p className="mt-1 text-sm text-slate-500">Move accepted delivery quantities from Receiving into a storage or pick-face bin. Partial placement is supported.</p></div>
    {tasksQuery.isLoading ? <p className="text-sm text-slate-500">Loading tasks…</p> : tasksQuery.isError ? feedback(errorText(tasksQuery.error)) : !tasksQuery.data?.length ? <p className="text-sm text-slate-500">There are no open putaway tasks.</p> : <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_2fr]"><div className="space-y-2">{tasksQuery.data.map((task) => <button key={task.id} type="button" onClick={() => setSelectedTask(task.id)} className={`w-full rounded-lg border p-3 text-left ${selectedTask === task.id ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30" : "border-slate-200 dark:border-slate-700"}`}><span className="block font-medium text-slate-900 dark:text-white">{task.grnNumber}</span><span className="mt-1 block text-xs text-slate-500">{task.status} · {new Date(task.receivedAt).toLocaleDateString()}</span></button>)}</div><div className="space-y-3">{!selectedTask ? <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800/70">Choose a task to review its remaining lines.</p> : taskQuery.isLoading ? <p className="text-sm text-slate-500">Loading task lines…</p> : taskQuery.isError ? feedback(errorText(taskQuery.error)) : taskQuery.data?.data.lines.map((line) => <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700" key={line.id}><p className="font-medium text-slate-900 dark:text-white">Product {line.productId}</p><p className="mt-1 text-sm text-slate-500">Accepted {line.quantityAccepted} · Placed {line.quantityPlaced} · Remaining {line.quantityRemaining}</p>{line.quantityRemaining > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px_auto]"><Select aria-label="Destination bin" value={destinations[line.id] ?? ""} onChange={(event) => setDestinations((current) => ({ ...current, [line.id]: event.target.value }))}><option value="">Choose destination bin</option>{destinationsAvailable.map((bin) => <option key={bin.id} value={bin.id}>{bin.code} · {bin.name}</option>)}</Select><Input aria-label="Quantity to put away" type="number" min={1} max={line.quantityRemaining} value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="Quantity" /><Button disabled={putaway.isPending || !destinations[line.id] || !(Number(quantities[line.id]) > 0)} onClick={() => putaway.mutate({ taskId: selectedTask, lineId: line.id, destinationBinId: destinations[line.id]!, quantity: Number(quantities[line.id]) })}>Place stock</Button></div>}</div>)}{putaway.isError && feedback(errorText(putaway.error))}{putaway.isSuccess && feedback("Putaway movement recorded.", true)}</div></div>}
  </Card>;
}

export function WarehouseTransfersSection({ locationId, bins }: { locationId: string; bins: Bin[] }) {
  const client = useQueryClient();
  const [balanceId, setBalanceId] = useState("");
  const [destinationBinId, setDestinationBinId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const stockQuery = useQuery({ queryKey: ["warehouse", "sellable-stock", locationId], queryFn: () => apiRequest<ApiList<StockRow>>(`${warehouse}/stock?locationId=${locationId}&pageSize=100`) });
  const source = stockQuery.data?.data.find((row) => row.balanceId === balanceId);
  const compatibleBins = bins.filter((bin) => bin.id !== source?.binId && bin.status === "ACTIVE" && (source?.disposition === "QUARANTINED" ? bin.binType === "QUARANTINE" : source?.disposition === "DISCREPANCY" ? bin.binType === "DISCREPANCY" : ["STORAGE", "PICK_FACE"].includes(bin.binType)));
  const transfer = useMutation({
    mutationFn: () => apiRequest(`${warehouse}/movements`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ locationId, productId: source?.productId, sourceBinId: source?.binId, destinationBinId, quantity: Number(quantity), disposition: source?.disposition, actorId: CURRENT_ACTOR_ID, reason: reason || undefined }) }),
    onSuccess: async () => { setQuantity(""); await client.invalidateQueries({ queryKey: ["warehouse"] }); },
  });
  return <Card className="space-y-4 p-5"><div><h2 className="font-semibold text-slate-950">Move stock between bins</h2><p className="mt-1 text-sm text-slate-500">Within-location transfers do not change Inventory on-hand totals.</p></div>
    {stockQuery.isError && feedback(errorText(stockQuery.error))}
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); transfer.mutate(); }}>
      <Select aria-label="Source bin stock" value={balanceId} onChange={(event) => { setBalanceId(event.target.value); setDestinationBinId(""); }}><option value="">Choose product and source bin</option>{stockQuery.data?.data.filter((row) => row.availableQuantity > 0).map((row) => <option key={row.balanceId} value={row.balanceId}>{row.binCode} · Product {row.productId.slice(0, 8)} · {row.availableQuantity} available</option>)}</Select>
      <Select aria-label="Destination bin" value={destinationBinId} onChange={(event) => setDestinationBinId(event.target.value)} disabled={!source}><option value="">Choose destination bin</option>{compatibleBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.code} · {bin.name}</option>)}</Select>
      <Input aria-label="Transfer quantity" type="number" min={1} max={source?.availableQuantity} placeholder="Quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      <Input aria-label="Transfer reason" placeholder="Reason (optional)" maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} />
      <div><Button type="submit" disabled={transfer.isPending || !source || !destinationBinId || Number(quantity) < 1 || Number(quantity) > (source?.availableQuantity ?? 0)}>{transfer.isPending ? "Recording…" : "Record transfer"}</Button></div>
    </form>
    {transfer.isError && feedback(errorText(transfer.error))}{transfer.isSuccess && feedback("Bin transfer recorded.", true)}
  </Card>;
}

export function WarehouseReportsSection({ locationId }: { locationId: string }) {
  const reconciliation = useQuery({ queryKey: ["warehouse", "reconciliation", locationId], queryFn: () => apiRequest<{ data: { calculatedAt: string; inBalance: boolean; varianceCount: number; records: Array<{ productId: string; inventoryQuantity: number; warehouseQuantity: number; variance: number }> } }>(`${warehouse}/reconciliation?locationId=${locationId}`) });
  const movements = useQuery({ queryKey: ["warehouse", "movement-history", locationId], queryFn: () => apiRequest<{ data: Array<{ id: string; movementType: string; productId: string; quantity: number; sourceBinId: string | null; destinationBinId: string; actorId: string; createdAt: string }> }>(`${warehouse}/movements?locationId=${locationId}&pageSize=25`) });
  return <div className="space-y-5">
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-200 p-5 dark:border-slate-700"><h2 className="font-semibold text-slate-950 dark:text-white">Inventory reconciliation</h2><p className="mt-1 text-sm text-slate-500">Read-only comparison of Inventory on-hand with sellable units assigned to Warehouse bins.</p></div>{reconciliation.isLoading ? <p className="p-5 text-sm text-slate-500">Calculating…</p> : reconciliation.isError ? <div className="p-5">{feedback(errorText(reconciliation.error))}</div> : <div className="space-y-4 p-5"><div className={`rounded-lg border p-4 ${reconciliation.data?.data.inBalance ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"}`}><p className="font-semibold">{reconciliation.data?.data.inBalance ? "In balance" : `${reconciliation.data?.data.varianceCount} product variances found`}</p><p className="mt-1 text-sm">Calculated {new Date(reconciliation.data!.data.calculatedAt).toLocaleString()}. This report never changes stock.</p></div>{reconciliation.data?.data.records.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Product ID</th><th>Inventory</th><th>Warehouse</th><th>Variance</th></tr></thead><tbody>{reconciliation.data.data.records.map((row) => <tr key={row.productId} className="border-t border-slate-200 dark:border-slate-700"><td className="py-3 font-medium">{row.productId}</td><td>{row.inventoryQuantity}</td><td>{row.warehouseQuantity}</td><td className={row.variance ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>{row.variance > 0 ? "+" : ""}{row.variance}</td></tr>)}</tbody></table></div> : null}</div>}</Card>
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-200 p-5 dark:border-slate-700"><h2 className="font-semibold text-slate-950 dark:text-white">Movement history</h2><p className="mt-1 text-sm text-slate-500">Latest 25 immutable movements for this location.</p></div>{movements.isLoading ? <p className="p-5 text-sm text-slate-500">Loading movements…</p> : movements.isError ? <div className="p-5">{feedback(errorText(movements.error))}</div> : !movements.data?.data.length ? <p className="p-5 text-sm text-slate-500">No Warehouse movements recorded yet.</p> : <div className="divide-y divide-slate-200 dark:divide-slate-700">{movements.data.data.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium text-slate-900 dark:text-slate-100">{item.movementType.replaceAll("_", " ")} · Product {item.productId.slice(0, 8)}</p><p className="mt-1 text-xs text-slate-500">{item.sourceBinId ? `From ${item.sourceBinId.slice(0, 8)} · ` : ""}To {item.destinationBinId.slice(0, 8)} · Actor {item.actorId.slice(0, 8)}</p></div><span className="text-sm text-slate-600 dark:text-slate-300">{item.quantity} units · {new Date(item.createdAt).toLocaleString()}</span></div>)}</div>}</Card>
  </div>;
}

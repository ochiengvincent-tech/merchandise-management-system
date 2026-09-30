import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";
import { useLocations } from "../../features/locations/hooks";
import { WarehouseBinsSection, WarehousePutawaySection, WarehouseReportsSection, WarehouseTransfersSection } from "./warehouse-workflows";

type Bin = { id: string; code: string; name: string; binType: string; status: string; systemManaged: boolean };
type Task = { id: string; grnNumber: string; purchaseOrderId: string; status: string; createdAt: string };
type ListResponse<T> = { data: T[] };
type BootstrapResponse = { data: { sourceStockCount: number; sourceTotalUnits: number; completedAt: string } | null };

export function WarehouseOperationsPage() {
  const queryClient = useQueryClient();
  const locationsQuery = useLocations({ status: "ACTIVE" });
  const locations = locationsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [activeSection, setActiveSection] = useState("Overview");
  const activeLocationId = locations.some((location) => location.id === selectedId) ? selectedId : locations[0]?.id ?? "";
  const location = locations.find((item) => item.id === activeLocationId);
  const bootstrapQuery = useQuery({
    queryKey: ["warehouse", "bootstrap", activeLocationId],
    queryFn: () => apiRequest<BootstrapResponse>(`${API_URLS.warehouse}/locations/${activeLocationId}/bootstrap`),
    enabled: Boolean(activeLocationId),
  });
  const binsQuery = useQuery({
    queryKey: ["warehouse", "bins", activeLocationId],
    queryFn: () => apiRequest<ListResponse<Bin>>(`${API_URLS.warehouse}/locations/${activeLocationId}/bins`),
    enabled: Boolean(activeLocationId && location?.warehouseManaged),
  });
  const tasksQuery = useQuery({
    queryKey: ["warehouse", "putaway", activeLocationId],
    queryFn: () => apiRequest<ListResponse<Task>>(`${API_URLS.warehouse}/putaway-tasks?locationId=${activeLocationId}&status=OPEN`),
    enabled: Boolean(activeLocationId && location?.warehouseManaged),
  });
  const bootstrapMutation = useMutation({
    mutationFn: () => apiRequest<BootstrapResponse>(`${API_URLS.warehouse}/locations/${activeLocationId}/bootstrap`, {
      method: "POST", body: JSON.stringify({ actorId: CURRENT_ACTOR_ID }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
      ]);
    },
  });
  const bins = binsQuery.data?.data ?? [];
  const tasks = tasksQuery.data?.data ?? [];
  const binCounts = useMemo(() => ({ active: bins.filter((bin) => bin.status === "ACTIVE").length, system: bins.filter((bin) => bin.systemManaged).length }), [bins]);

  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold text-slate-950">Warehouse Operations</h1>
      <p className="mt-1 text-sm text-slate-500">Manage bin locations, opening stock, and putaway work.</p>
    </header>
    <Card className="space-y-5 p-5">
      <div className="max-w-xl">
        <label htmlFor="warehouse-location" className="mb-1.5 block text-sm font-medium text-slate-700">Inventory location</label>
        <Select id="warehouse-location" value={activeLocationId} onChange={(event) => setSelectedId(event.target.value)} disabled={locationsQuery.isLoading || locations.length === 0}>
          {locations.length === 0 && <option value="">No active locations</option>}
          {locations.map((item) => <option key={item.id} value={item.id}>{item.locationCode} · {item.name}</option>)}
        </Select>
      </div>
      {locationsQuery.isError && <p className="text-sm text-red-600">Could not load Inventory locations.</p>}
      {activeLocationId && bootstrapQuery.isLoading && <p className="text-sm text-slate-500">Checking Warehouse setup…</p>}
      {activeLocationId && bootstrapQuery.isError && <p className="text-sm text-red-600">Could not load this location’s Warehouse setup.</p>}
      {location && !location.warehouseManaged && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <h2 className="font-semibold text-amber-950 dark:text-amber-200">Set up this location</h2>
        <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">Import current Inventory quantities into an Unassigned bin before enabling bin-level operations. Review your stock snapshot before continuing.</p>
        {bootstrapQuery.data?.data && <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">Previous bootstrap: {bootstrapQuery.data.data.sourceStockCount} stock records · {bootstrapQuery.data.data.sourceTotalUnits} units.</p>}
        {bootstrapMutation.isError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{bootstrapMutation.error instanceof Error ? bootstrapMutation.error.message : "Could not bootstrap this location."}</p>}
        <div className="mt-4"><Button onClick={() => bootstrapMutation.mutate()} disabled={bootstrapMutation.isPending || !activeLocationId}>{bootstrapMutation.isPending ? "Importing stock…" : "Import stock and enable Warehouse"}</Button></div>
      </div>}
      {location?.warehouseManaged && <>
        <nav aria-label="Warehouse sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
          {["Overview", "Bins & stock", "Putaway", "Transfers", "Reports & history"].map((section) => <button key={section} type="button" onClick={() => setActiveSection(section)} aria-current={activeSection === section ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeSection === section ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"}`}>{section}</button>)}
        </nav>
        {activeSection === "Bins & stock" && <WarehouseBinsSection locationId={activeLocationId} />}
        {activeSection === "Putaway" && <WarehousePutawaySection locationId={activeLocationId} bins={bins} />}
        {activeSection === "Transfers" && <WarehouseTransfersSection locationId={activeLocationId} bins={bins} />}
        {activeSection === "Reports & history" && <WarehouseReportsSection locationId={activeLocationId} />}
        {activeSection === "Overview" && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-slate-500">Active bins</p><p className="mt-1 text-2xl font-semibold text-slate-950">{binCounts.active}</p></Card>
          <Card className="p-4"><p className="text-sm text-slate-500">Open putaway tasks</p><p className="mt-1 text-2xl font-semibold text-slate-950">{tasks.length}</p></Card>
          <Card className="p-4"><p className="text-sm text-slate-500">System bins</p><p className="mt-1 text-2xl font-semibold text-slate-950">{binCounts.system}</p></Card>
        </div>
        {binsQuery.isError || tasksQuery.isError ? <p role="alert" className="text-sm text-red-600">Warehouse data could not be loaded. Check that the Warehouse Operations service is running.</p> : null}
        <section>
          <h2 className="font-semibold text-slate-950">Bins</h2>
          {binsQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">Loading bins…</p> : bins.length === 0 ? <p className="mt-3 text-sm text-slate-500">No bins found for this location.</p> : <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{bins.map((bin) => <li key={bin.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><strong className="text-sm text-slate-900 dark:text-slate-100">{bin.code} · {bin.name}</strong><span className="ml-2 text-xs text-slate-500">{bin.binType}</span></span><Badge>{bin.status}{bin.systemManaged ? " · SYSTEM" : ""}</Badge></li>)}</ul>}
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">Open putaway tasks</h2>
          {tasksQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">Loading tasks…</p> : tasks.length === 0 ? <p className="mt-3 text-sm text-slate-500">No open putaway tasks. New accepted deliveries will appear here.</p> : <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 p-3"><span className="text-sm font-medium text-slate-900 dark:text-slate-100">{task.grnNumber}</span><Badge>{task.status}</Badge></li>)}</ul>}
        </section>
        </>}
      </>}
    </Card>
  </div>;
}

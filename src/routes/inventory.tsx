import { createFileRoute, Link } from "@tanstack/react-router";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, Tag } from "@/components/kitchen/agents";
import { InventoryAgentPanel } from "@/components/kitchen/inventory-agent-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { InventoryOrders } from "@/components/kitchen/inventory-orders";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { useState } from "react";
import { IngredientEditDialog } from "@/components/kitchen/ingredient-edit-dialog";
import { IngredientPhoto } from "@/components/kitchen/ingredient-photo";
import { FOOD_CATEGORIES, ingredientCategory, matchesIngredientSearch } from "@/lib/kitchen/inventory-catalog";
import type { Ingredient } from "@/lib/kitchen/types";
import { DISHES } from "@/lib/kitchen/data";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/inventory")({
  validateSearch: (search: Record<string, unknown>): { view?: "stock" | "delivered" | "incoming" } => ({ ...(search["view"] === "stock" || search["view"] === "delivered" || search["view"] === "incoming" ? { view: search["view"] } : {}) }),
  head: () => ({
    meta: [
      { title: "Inventory · NutriSync" },
      { name: "description", content: "Seven- and fourteen-day ingredient forecasts, delivery risks and incoming kitchen orders." },
      { property: "og:title", content: "Inventory · NutriSync" },
      { property: "og:description", content: "Plan ingredient purchases ahead of service and track incoming deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { state, analysis, dispatch } = useKitchen();
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<string>("All");
  const { view = "stock" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setView = (view: "stock" | "delivered" | "incoming") => navigate({ search: { view } });
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [deleting, setDeleting] = useState<Ingredient | null>(null);
  const [query, setQuery] = useState("");
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const forecast = analysis.forecast;
  const horizon = state.purchaseHorizonDays ?? 7;
  const incoming = (state.orders ?? []).filter((order) => order.status === "incoming");
  const today = dateKey(dayAt(0));
  const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const rows = state.ingredients.filter((i) => matchesIngredientSearch(i, query)).sort((a, b) => {
    const r = (i: typeof a) => (forecast?.demand[i.id] ?? 0) / Math.max(0.01, i.stock + i.onOrder);
    return r(b) - r(a);
  });

  return (
    <>
      <PageHeader eyebrow="Pantry & walk-in" title="Inventory"><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search ingredients" placeholder="Search ingredients or vendors" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64 pl-9" /></div><Button onClick={() => setAdding(true)}><Plus />Add New</Button></div></PageHeader>

      <div role="tablist" aria-label="Inventory views" className="mb-6 flex flex-wrap gap-2 border-b pb-3">
        {([{ id: "stock", label: "Food stock" }, { id: "delivered", label: "Delivered orders" }, { id: "incoming", label: "Incoming orders" }] as const).map((item) => <Button key={item.id} role="tab" aria-selected={view === item.id} variant={view === item.id ? "default" : "ghost"} onClick={() => setView(item.id)}>{item.label}</Button>)}
      </div>
      {view !== "stock" ? <InventoryOrders key={view} mode={view} /> : <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <div className="mb-2 text-sm font-semibold">Consumption forecast</div>
          <div className="flex gap-1" role="group" aria-label="Forecast period">
            <Button variant={horizon === 7 ? "default" : "outline"} aria-pressed={horizon === 7} onClick={() => dispatch({ type: "setHorizon", days: 7 })}>7 days</Button>
            <Button variant={horizon === 14 ? "default" : "outline"} aria-pressed={horizon === 14} onClick={() => dispatch({ type: "setHorizon", days: 14 })}>14 days</Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{dateLabel(today)} – {dateLabel(dateKey(dayAt(horizon - 1)))} · {state.residents.length} residents · {horizon * 3} meals</div>
        </div>
        <label className="text-sm font-medium">Supplier lead time
          <div className="mt-2 flex items-center gap-2"><Input aria-label="Supplier lead time" type="number" min={1} max={14} value={state.leadTimeDays ?? 2} onChange={(e) => dispatch({ type: "setLeadTime", days: Number(e.target.value) })} className="w-20 bg-background" /><span className="text-muted-foreground">days</span></div>
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="border-l-2 border-destructive pl-4"><div className="text-xs text-muted-foreground">Short for today's service</div><div className="mt-1 text-2xl font-semibold">{Object.keys(forecast?.todayShortage ?? {}).length} ingredients</div></div>
        <div className="border-l-2 border-agent-inventory pl-4"><div className="text-xs text-muted-foreground">Purchases to review</div><div className="mt-1 text-2xl font-semibold">${purchases.reduce((sum, p) => sum + p.total, 0).toFixed(2)}</div></div>
        <div className="border-l-2 border-success pl-4"><div className="text-xs text-muted-foreground">Incoming deliveries</div><div className="mt-1 text-2xl font-semibold">{incoming.length} orders</div></div>
      </div>
      {Object.keys(forecast?.todayShortage ?? {}).length > 0 && <div className="mb-5 border-l-4 border-destructive bg-danger-soft p-4 text-sm"><div className="font-semibold text-destructive">Today's service needs attention</div><div className="mt-1">{Object.entries(forecast?.todayShortage ?? {}).map(([id, qty]) => { const i = state.ingredients.find((i) => i.id === id); return i ? `${i.name}: short ${qty} ${i.unit}` : `${id}: missing from inventory`; }).join(" · ")}</div><div className="mt-2 text-muted-foreground">Use an available-stock alternative or arrange an emergency transfer. New orders will not arrive in time for today's meals.</div></div>}
      {(forecast?.unresolved ?? 0) > 0 && <div className="mb-5 border-l-4 border-warning bg-warning-soft p-4 text-sm">{forecast?.unresolved} resident-meal conflicts have no safe alternative on file in this period. Forecast is provisional until staff resolve them.</div>}

      <InventoryAgentPanel />

      {purchases.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-agent-inventory bg-agent-inventory-soft p-4">
          <AgentAvatar agent="inventory" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">{purchases.length} purchase request{purchases.length > 1 ? "s" : ""} for the {horizon}-day plan</div>
            <div className="text-muted-foreground">{purchases.map((p) => p.kind === "purchase" && `${p.vendor} ($${p.total.toFixed(2)})`).join(" · ")}</div>
          </div>
          <Button asChild><Link to="/approvals" search={{ kind: "purchase" }}>Review orders</Link></Button>
        </div>
      )}

      <div role="tablist" aria-label="Ingredient sections" className="sticky top-0 z-10 -mx-1 mb-6 flex flex-wrap gap-2 bg-background/95 px-1 py-3 backdrop-blur">
        {["All", ...FOOD_CATEGORIES].map((c) => { const n = c === "All" ? rows.length : rows.filter((i) => ingredientCategory(i) === c).length; if (c !== "All" && !n) return null; return <Button key={c} role="tab" aria-selected={tab === c} onClick={() => setTab(c)} variant={tab === c ? "default" : "outline"}>{c} <span className="ml-1 opacity-70">{n}</span></Button>; })}
      </div>
      {FOOD_CATEGORIES.filter((c) => tab === "All" || c === tab).map((category) => { const categoryRows = rows.filter((i) => ingredientCategory(i) === category); if (!categoryRows.length) return null; return <section key={category} aria-label={category} className="mb-8"><h2 className="mb-3 font-display text-xl font-semibold">{category} <span className="ml-2 text-sm font-normal text-muted-foreground">{categoryRows.length}</span></h2><div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Ingredient</th><th className="px-4 py-3">In stock</th><th className="px-4 py-3">On order</th><th className="px-4 py-3">Today</th><th className="px-4 py-3">{horizon}-day consumption</th><th className="w-44 px-4 py-3">First shortage</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y">
            {categoryRows.map((i) => {
              const need = forecast?.demand[i.id] ?? 0;
              const shortageDate = forecast?.firstShortDate[i.id];
              const deliveries = incoming.filter((order) => order.lines.some((line) => line.ingredientId === i.id));
              return (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-medium"><div className="flex items-center gap-3"><IngredientPhoto ingredient={i} /><span>{i.name}</span></div></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span>{i.stock}</span>
                      <span className="text-xs text-muted-foreground">{i.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{i.onOrder ? <><Tag tone="ok">+{Math.round(i.onOrder * 100) / 100} {i.unit}</Tag><div className="mt-1 text-xs text-muted-foreground">{deliveries.length ? deliveries.map((order) => `Due ${dateLabel(order.deliveryDate)}`).join(" · ") : "Delivery date unconfirmed"}</div></> : <span className="text-xs text-muted-foreground">Not ordered</span>}</td>
                  <td className="px-4 py-3">{analysis.demand[i.id] ?? 0} {i.unit}</td>
                  <td className="px-4 py-3">{need ? `${need} ${i.unit}` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">
                    {shortageDate ? <div className={cn("text-xs font-semibold", shortageDate <= dateKey(dayAt(state.leadTimeDays ?? 2)) ? "text-destructive" : "text-warning")}><div>{shortageDate === today ? "Today" : dateLabel(shortageDate)}</div><div className="mt-1 font-normal">{shortageDate <= dateKey(dayAt(state.leadTimeDays ?? 2)) ? "Inside lead time" : "Order ahead"}</div></div> : <Tag tone="ok">Covered</Tag>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{i.vendor}</td><td className="px-3 py-3"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${i.name}`} title={`Edit ${i.name}`} onClick={() => setEditing(i)}><Pencil /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${i.name}`} title={`Delete ${i.name}`} onClick={() => setDeleting(i)}><Trash2 /></Button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></section>; })}
      {!rows.length && <p className="border-y py-8 text-center text-muted-foreground">No ingredients found.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Estimate from the sample rotating menu, including dietary alternatives. Today's consumption is included. Incoming stock counts only from its expected delivery date; available stock changes when a delivery is received.</p>
      </>}
      {(adding || editing) && <IngredientEditDialog {...(editing ? { ingredient: editing } : {})} onClose={() => { setAdding(false); setEditing(null); }} />}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg"><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This removes this inventory item and its order lines. This cannot be undone.{deleting && DISHES.some((d) => d.ingredients.some((i) => i.id === deleting.id)) && " Meals still require this ingredient; it will be flagged as missing until you add it again or change the menu."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" onClick={() => { if (!deleting) return; dispatch({ type: "deleteIngredient", id: deleting.id }); setDeleting(null); }}>Confirm delete</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, Tag } from "@/components/kitchen/agents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PackageCheck, Plus, Truck } from "lucide-react";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · Hearth Kitchen Command" },
      { name: "description", content: "Seven- and fourteen-day ingredient forecasts, delivery risks and incoming kitchen orders." },
      { property: "og:title", content: "Inventory · Hearth Kitchen Command" },
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
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const forecast = analysis.forecast;
  const horizon = state.purchaseHorizonDays ?? 7;
  const incoming = (state.orders ?? []).filter((order) => order.status === "incoming");
  const today = dateKey(dayAt(0));
  const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const rows = [...state.ingredients].sort((a, b) => {
    const r = (i: typeof a) => (forecast?.demand[i.id] ?? 0) / Math.max(0.01, i.stock + i.onOrder);
    return r(b) - r(a);
  });

  return (
    <>
      <PageHeader eyebrow="Pantry & walk-in" title="Inventory"><Button onClick={() => setAdding(true)}><Plus />Add New</Button></PageHeader>

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
      {Object.keys(forecast?.todayShortage ?? {}).length > 0 && <div className="mb-5 border-l-4 border-destructive bg-danger-soft p-4 text-sm"><div className="font-semibold text-destructive">Today's service needs attention</div><div className="mt-1">{state.ingredients.filter((i) => forecast?.todayShortage[i.id]).map((i) => `${i.name}: short ${forecast?.todayShortage[i.id]} ${i.unit}`).join(" · ")}</div><div className="mt-2 text-muted-foreground">Use an available-stock alternative or arrange an emergency transfer. New orders will not arrive in time for today's meals.</div></div>}
      {(forecast?.unresolved ?? 0) > 0 && <div className="mb-5 border-l-4 border-warning bg-warning-soft p-4 text-sm">{forecast?.unresolved} resident-meal conflicts have no safe alternative on file in this period. Forecast is provisional until staff resolve them.</div>}

      {purchases.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-agent-inventory bg-agent-inventory-soft p-4">
          <AgentAvatar agent="inventory" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">{purchases.length} purchase request{purchases.length > 1 ? "s" : ""} for the {horizon}-day plan</div>
            <div className="text-muted-foreground">{purchases.map((p) => p.kind === "purchase" && `${p.vendor} ($${p.total.toFixed(2)})`).join(" · ")}</div>
          </div>
          <Button asChild><Link to="/approvals" search={{ kind: "purchase" }}>Review orders</Link></Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Ingredient</th><th className="px-4 py-3">In stock</th><th className="px-4 py-3">On order</th><th className="px-4 py-3">Today</th><th className="px-4 py-3">{horizon}-day consumption</th><th className="w-44 px-4 py-3">First shortage</th><th className="px-4 py-3">Vendor</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((i) => {
              const need = forecast?.demand[i.id] ?? 0;
              const shortageDate = forecast?.firstShortDate[i.id];
              const deliveries = incoming.filter((order) => order.lines.some((line) => line.ingredientId === i.id));
              return (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Input aria-label={`${i.name} in stock`} type="number" step="any" min={0} value={i.stock} onChange={(e) => dispatch({ type: "setStock", id: i.id, stock: Number(e.target.value) })} className="h-8 w-20 bg-background" />
                      <span className="text-xs text-muted-foreground">{i.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{i.onOrder ? <><Tag tone="ok">+{Math.round(i.onOrder * 100) / 100} {i.unit}</Tag><div className="mt-1 text-xs text-muted-foreground">{deliveries.length ? deliveries.map((order) => `Due ${dateLabel(order.deliveryDate)}`).join(" · ") : "Delivery date unconfirmed"}</div></> : <span className="text-xs text-muted-foreground">Not ordered</span>}</td>
                  <td className="px-4 py-3">{analysis.demand[i.id] ?? 0} {i.unit}</td>
                  <td className="px-4 py-3">{need ? `${need} ${i.unit}` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">
                    {shortageDate ? <div className={cn("text-xs font-semibold", shortageDate <= dateKey(dayAt(state.leadTimeDays ?? 2)) ? "text-destructive" : "text-warning")}><div>{shortageDate === today ? "Today" : dateLabel(shortageDate)}</div><div className="mt-1 font-normal">{shortageDate <= dateKey(dayAt(state.leadTimeDays ?? 2)) ? "Inside lead time" : "Order ahead"}</div></div> : <Tag tone="ok">Covered</Tag>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{i.vendor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Estimate from the sample rotating menu, including dietary alternatives. Today's consumption is included. Incoming stock counts only from its expected delivery date; available stock changes when a delivery is received.</p>
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Truck className="h-5 w-5" />Incoming orders</h2>
        {!incoming.length ? <div className="border-y py-5 text-sm text-muted-foreground">No approved orders are incoming. Pending requests are not yet on order.</div> : <div className="divide-y border-y">{incoming.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-0 flex-1"><div className="font-semibold">{order.vendor} <span className="ml-2 text-xs font-normal text-muted-foreground">Expected {dateLabel(order.deliveryDate)}</span></div><div className="mt-1 text-sm text-muted-foreground">{order.lines.map((line) => { const ingredient = state.ingredients.find((i) => i.id === line.ingredientId); return `${ingredient?.name ?? line.ingredientId} · ${line.qty} ${ingredient?.unit ?? ""}`; }).join(" / ")}</div></div><Button variant="outline" onClick={() => dispatch({ type: "receiveOrder", id: order.id })}><PackageCheck />Mark received</Button></div>)}</div>}
      </section>
      {adding && <AddIngredientDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddIngredientDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stock, setStock] = useState("0");
  const [packSize, setPackSize] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const duplicate = state.ingredients.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Add ingredient</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (duplicate) return;
        dispatch({ type: "addIngredient", ingredient: { id: crypto.randomUUID(), name, vendor, unit, stock: Number(stock), packSize: Number(packSize), unitCost: Number(unitCost), onOrder: 0 } });
        toast.success("Ingredient added"); onClose();
      }}>
        <label className="block text-sm font-medium">Ingredient name<Input required aria-label="Ingredient name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {duplicate && <p role="alert" className="text-sm text-destructive">This ingredient already exists.</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Unit<Select value={unit} onValueChange={setUnit}><SelectTrigger aria-label="Ingredient unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="L">L</SelectItem><SelectItem value="each">each</SelectItem></SelectContent></Select></label>
          <label className="text-sm font-medium">In stock ({unit})<Input required aria-label="Initial stock" type="number" min={0} step="any" value={stock} onChange={(e) => setStock(e.target.value)} /></label>
          <label className="text-sm font-medium">Order pack size ({unit})<Input required aria-label="Order pack size" type="number" min={0.001} step="any" value={packSize} onChange={(e) => setPackSize(e.target.value)} /></label>
          <label className="text-sm font-medium">Cost per {unit} ($)<Input required aria-label="Unit cost" type="number" min={0} step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></label>
        </div>
        <label className="block text-sm font-medium">Vendor<Input required aria-label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} /></label>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={duplicate || !name.trim() || !vendor.trim()}>Add ingredient</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

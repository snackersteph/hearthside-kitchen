import { createFileRoute, Link } from "@tanstack/react-router";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, Tag } from "@/components/kitchen/agents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · Hearth Kitchen Command" },
      { name: "description", content: "Ingredient stock versus today's demand, plus agent-prepared purchase requests." },
      { property: "og:title", content: "Inventory · Hearth Kitchen Command" },
      { property: "og:description", content: "Ingredient stock versus today's demand and purchase requests." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { state, analysis, dispatch } = useKitchen();
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const rows = [...state.ingredients].sort((a, b) => {
    const r = (i: typeof a) => (analysis.demand[i.id] ?? 0) / Math.max(0.01, i.stock + i.onOrder);
    return r(b) - r(a);
  });

  return (
    <>
      <PageHeader eyebrow="Pantry & walk-in" title="Inventory" />

      {purchases.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-agent-inventory bg-agent-inventory-soft p-4">
          <AgentAvatar agent="inventory" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">{purchases.length} purchase request{purchases.length > 1 ? "s" : ""} ready for approval</div>
            <div className="text-muted-foreground">{purchases.map((p) => p.kind === "purchase" && `${p.vendor} ($${p.total.toFixed(2)})`).join(" · ")}</div>
          </div>
          <Button asChild><Link to="/approvals">Review orders</Link></Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Ingredient</th><th className="px-4 py-3">In stock</th><th className="px-4 py-3">On order</th><th className="px-4 py-3">Needed today</th><th className="w-48 px-4 py-3">Coverage</th><th className="px-4 py-3">Vendor</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((i) => {
              const need = analysis.demand[i.id] ?? 0;
              const have = i.stock + i.onOrder;
              const pct = need ? Math.min(100, (have / need) * 100) : 100;
              const short = need > have;
              return (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" step="any" min={0} value={i.stock} onChange={(e) => dispatch({ type: "setStock", id: i.id, stock: Number(e.target.value) })} className="h-8 w-20 bg-background" />
                      <span className="text-xs text-muted-foreground">{i.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{i.onOrder ? <Tag tone="ok">+{i.onOrder} {i.unit}</Tag> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{need ? `${need} ${i.unit}` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", short ? "bg-destructive" : pct < 100 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} /></div>
                    {short && <div className="mt-1 text-xs font-semibold text-destructive">Short {Math.round((need - have) * 100) / 100} {i.unit}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{i.vendor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Demand includes approved meals and pending swaps. Approved orders count as arriving before service.</p>
    </>
  );
}

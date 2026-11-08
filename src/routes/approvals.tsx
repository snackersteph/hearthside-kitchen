import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { DISHES, dishById } from "@/lib/kitchen/data";
import { conflictReasons, lineCost, type MealReview } from "@/lib/kitchen/engine";
import type { Proposal, PurchaseProposal, SubstitutionProposal } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar, AgentChip, MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { canApproveMeal } from "@/lib/kitchen/schedule";

export const Route = createFileRoute("/approvals")({
  validateSearch: (search: Record<string, unknown>): { kind?: "purchase" | "substitution"; date?: string } => {
    const kind = search["kind"];
    const date = typeof search["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["date"]) ? search["date"] : undefined;
    return { ...(kind === "purchase" || kind === "substitution" ? { kind } : {}), ...(date ? { date } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Approval Center · Hearth Kitchen Command" },
      { name: "description", content: "Review, modify and approve menu swaps and purchase requests from your kitchen agents." },
      { property: "og:title", content: "Approval Center · Hearth Kitchen Command" },
      { property: "og:description", content: "Review, modify and approve agent proposals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { state, analysis } = useKitchen();
  const { kind, date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const proposals = analysis.proposals.filter((p) => (!kind || p.kind === kind) && (!date || (p.kind === "substitution" && p.serviceDate === date)));
  const reviews = kind === "purchase" ? [] : (analysis.mealReviews ?? []).filter((r) => !r.approved && (!date || r.serviceDate === date));
  const history = state.history.filter((h) => (!kind || h.kind === kind) && (!date || h.serviceDate === date));
  return (
    <>
      <PageHeader eyebrow="Human in the loop" title={kind === "purchase" ? "Purchase Orders" : "Approval Center"} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Proposal type">
        <Button variant={!kind ? "default" : "outline"} onClick={() => navigate({ search: {} })}>All proposals</Button>
        <Button variant={kind === "purchase" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "purchase" } })}>Orders only</Button>
        <Button variant={kind === "substitution" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "substitution" } })}>Meals only</Button>
      </div>
      {date && <div className="mb-4 flex items-center gap-3 text-sm font-semibold">Service date: {date}<Button size="sm" variant="ghost" onClick={() => navigate({ search: kind ? { kind } : {} })}>All dates</Button></div>}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({proposals.length + reviews.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-6 space-y-4">
          {proposals.length === 0 && reviews.length === 0 && <Empty text={kind === "purchase" ? "No purchase requests awaiting approval." : "Nothing awaiting approval."} />}
          {reviews.length > 0 && <section className="space-y-3">
            <h2 className="text-xl font-semibold">Meal sign-off · due the day before service</h2>
            {reviews.map((r) => <MealReviewCard key={r.serviceDate + r.meal} review={r} />)}
          </section>}
          {proposals.map((p) => <ProposalCard key={p.id} p={p} />)}
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          {history.length === 0 ? <Empty text="No decisions yet." /> : (
            <ul className="divide-y rounded-xl border bg-card shadow-soft">
              {history.map((h) => (
                <li key={h.proposalId + h.at} className="flex items-center gap-3 px-5 py-4 text-sm">
                  <Tag tone={h.status === "approved" ? "ok" : "danger"}>{h.status}</Tag>
                  {h.modified && <Tag tone="warn">modified</Tag>}
                  <span className="flex-1">{h.summary}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

const Empty = ({ text }: { text: string }) => <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{text}</div>;

function MealReviewCard({ review: r }: { review: MealReview }) {
  const { dispatch } = useKitchen();
  const timely = canApproveMeal(r.serviceDate);
  const ready = !r.pending && !r.unresolved;
  return <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-soft">
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground">{r.serviceDate} · {MEAL_LABEL[r.meal]}</div>
      <h3 className="mt-1 font-semibold">{dishById(r.mainDishId).name}</h3>
      <div className="mt-2 flex flex-wrap gap-2"><Tag tone={timely ? "warn" : "danger"}>{timely ? `Due ${r.approvalDueDate}` : `Overdue · due ${r.approvalDueDate}`}</Tag>
      <Tag tone={ready ? "ok" : "warn"}>{r.unresolved ? `${r.unresolved} unresolved residents` : r.pending ? `${r.pending} residents awaiting alternatives` : "Dietary checks clear"}</Tag></div>
    </div>
    <Button size="sm" disabled={!timely || !ready} onClick={() => { dispatch({ type: "approveMeal", date: r.serviceDate, meal: r.meal }); toast.success(`${MEAL_LABEL[r.meal]} approved for ${r.serviceDate}`); }}><Check />Approve meal</Button>
  </article>;
}

function ProposalCard({ p }: { p: Proposal }) {
  const [editing, setEditing] = useState(false);
  const agent = AGENTS[p.agent];
  return (
    <article className={cn("rounded-2xl border-l-4 bg-card p-6 shadow-soft", agent.border)}>
      <div className="flex flex-wrap items-start gap-4">
        <AgentAvatar agent={p.agent} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted-foreground">{agent.name} · {p.kind === "substitution" ? `${MEAL_LABEL[p.meal]} substitution` : "Purchase request"}</div>
          {p.kind === "substitution" ? <SubBody p={p} /> : <PurchaseBody p={p} />}
        </div>
        <Actions p={p} onModify={() => setEditing(true)} />
      </div>
      {editing && (p.kind === "substitution" ? <SubEditor p={p} onClose={() => setEditing(false)} /> : <PurchaseEditor p={p} onClose={() => setEditing(false)} />)}
    </article>
  );
}

function SubBody({ p }: { p: SubstitutionProposal }) {
  const { state } = useKitchen();
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2"><Tag>Service {p.serviceDate}</Tag><Tag tone={p.serviceDate && canApproveMeal(p.serviceDate) ? "warn" : "danger"}>Approval due {p.approvalDueDate}</Tag></div>
      <h3 className="mt-1 text-xl font-semibold">Serve {dishById(p.dishId).name} to {p.residentIds.length} resident{p.residentIds.length > 1 ? "s" : ""}</h3>
      <div className="mt-1 text-sm text-muted-foreground">Instead of {dishById(p.fromDishId).name}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <AgentChip agent="dietary" /><span className="text-muted-foreground">flagged conflicts</span><ArrowRight className="h-3 w-3" />
        <AgentChip agent="menu" /><span className="text-muted-foreground">found a safe swap</span><ArrowRight className="h-3 w-3" />
        <AgentChip agent="inventory" /><span className="text-muted-foreground">included it in stock demand</span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {p.residentIds.map((id) => (
          <li key={id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="font-medium">{residentName(state, id)}</span>
            <span className="text-muted-foreground"> — {p.reasons[id]?.join(", ")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PurchaseBody({ p }: { p: PurchaseProposal }) {
  const { state } = useKitchen();
  return (
    <>
      <h3 className="mt-1 text-xl font-semibold">Order from {p.vendor} · ${p.total.toFixed(2)}</h3>
      <div className="mt-1 text-sm text-muted-foreground">{p.horizonDays ?? 7}-day consumption · dietary alternatives included</div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs"><Tag tone="warn">First needed {p.neededDate}</Tag><Tag>Order by {p.orderByDate}</Tag><Tag>Expected delivery {p.deliveryDate}</Tag></div>
      {p.neededDate && p.deliveryDate && p.neededDate < p.deliveryDate && <div className="mt-3 text-sm font-medium text-destructive">Delivery is too late for the first shortage. Arrange available-stock alternatives or an emergency transfer.</div>}
      <table className="mt-4 w-full max-w-lg text-sm">
        <tbody className="divide-y">
          {p.lines.map((l) => { const i = state.ingredients.find((x) => x.id === l.ingredientId); if (!i) return null; return (
            <tr key={l.ingredientId}><td className="py-2">{i.name}</td><td className="py-2 text-muted-foreground">short {l.shortage} {i.unit}</td><td className="py-2 text-right font-semibold">{l.qty} {i.unit}</td><td className="py-2 text-right text-muted-foreground">${lineCost(state, l.ingredientId, l.qty).toFixed(2)}</td></tr>
          ); })}
        </tbody>
      </table>
    </>
  );
}

function summarize(state: ReturnType<typeof useKitchen>["state"], p: Proposal, verb: string) {
  return p.kind === "substitution"
    ? `${verb} ${p.serviceDate ?? ""} ${MEAL_LABEL[p.meal]} swap to ${dishById(p.dishId).name} for ${p.residentIds.map((id) => residentName(state, id).split(" ")[0]).join(", ")}`
    : `${verb} ${p.vendor} order ($${p.total.toFixed(2)})`;
}

function Actions({ p, onModify }: { p: Proposal; onModify: () => void }) {
  const { state, dispatch } = useKitchen();
  const late = p.kind === "substitution" && (!p.serviceDate || !canApproveMeal(p.serviceDate));
  const approve = () => {
    if (late) return;
    const summary = summarize(state, p, "Approved");
    if (p.kind === "substitution") dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: false, summary });
    else dispatch({ type: "approvePurchase", proposalId: p.id, lines: p.lines, modified: false, summary, vendor: p.vendor, ...(p.deliveryDate ? { deliveryDate: p.deliveryDate } : {}) });
    toast.success(summary);
  };
  const reject = () => {
    const summary = summarize(state, p, "Rejected");
    dispatch({ type: "reject", proposalId: p.id, kind: p.kind, summary, ...(p.kind === "substitution" ? { serviceDate: p.serviceDate } : {}) });
    toast(summary);
  };
  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" onClick={reject}><X /> Reject</Button>
      <Button variant="outline" size="sm" disabled={late} onClick={onModify}><Pencil /> Modify</Button>
      <Button size="sm" disabled={late} onClick={approve}><Check /> Approve</Button>
    </div>
  );
}

function SubEditor({ p, onClose }: { p: SubstitutionProposal; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [ids, setIds] = useState(p.residentIds);
  const [dishId, setDishId] = useState(p.dishId);
  const chosen = state.residents.filter((r) => ids.includes(r.id));
  const options = DISHES.filter((d) => d.meal === p.meal && d.id !== p.fromDishId);
  const unsafe = chosen.filter((r) => conflictReasons(r, dishById(dishId)).length);
  const save = () => {
    const summary = `Approved (modified) ${p.serviceDate ?? ""} ${MEAL_LABEL[p.meal]} swap to ${dishById(dishId).name} for ${chosen.map((r) => r.name.split(" ")[0]).join(", ")}`;
    dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId, residentIds: ids, serviceDate: p.serviceDate, modified: true, summary });
    toast.success(summary); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Modify substitution</DialogTitle></DialogHeader>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alternative dish</div>
        <div className="space-y-2">
          {options.map((d) => {
            const bad = chosen.filter((r) => conflictReasons(r, d).length).length;
            return (
              <Button variant="outline" key={d.id} onClick={() => setDishId(d.id)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm", dishId === d.id ? "border-primary bg-secondary" : "hover:border-primary")}>
                <span>{d.name}</span>{bad ? <Tag tone="danger">unsafe for {bad}</Tag> : <Tag tone="ok">safe</Tag>}
              </Button>
            );
          })}
        </div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Residents</div>
        <div className="grid grid-cols-2 gap-2">
          {p.residentIds.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={ids.includes(id)} onCheckedChange={(c) => setIds(c ? [...ids, id] : ids.filter((x) => x !== id))} />{residentName(state, id)}
            </label>
          ))}
        </div>
        {unsafe.length > 0 && <div className="rounded-lg bg-danger-soft p-3 text-sm text-destructive">Dietary Agent blocks this: unsafe for {unsafe.map((r) => r.name).join(", ")}.</div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ids.length || unsafe.length > 0 || !p.serviceDate || !canApproveMeal(p.serviceDate)} onClick={save}>Approve with changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseEditor({ p, onClose }: { p: PurchaseProposal; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [lines, setLines] = useState(p.lines);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryDate ?? "");
  const total = lines.reduce((s, l) => s + lineCost(state, l.ingredientId, l.qty), 0);
  const save = () => {
    const kept = lines.filter((l) => l.qty > 0);
    const summary = `Approved (modified) ${p.vendor} order ($${total.toFixed(2)})`;
    dispatch({ type: "approvePurchase", proposalId: p.id, lines: kept, modified: true, summary, vendor: p.vendor, deliveryDate });
    toast.success(summary); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Modify {p.vendor} order</DialogTitle></DialogHeader>
        <label className="text-sm font-medium">Expected delivery<Input aria-label="Expected delivery" className="mt-2" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label>
        <div className="space-y-3">
          {lines.map((l, idx) => { const i = state.ingredients.find((x) => x.id === l.ingredientId); if (!i) return null; return (
            <div key={l.ingredientId} className="flex items-center gap-3 text-sm">
              <span className="flex-1">{i.name}<span className="block text-xs text-muted-foreground">short {l.shortage} {i.unit}</span></span>
              <Input type="number" min={0} step="any" value={l.qty} className="w-24" onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x)))} />
              <span className="w-14 text-xs text-muted-foreground">{i.unit}</span>
            </div>
          ); })}
        </div>
        <div className="text-right font-semibold">Total ${total.toFixed(2)}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!deliveryDate || !lines.some((line) => line.qty > 0)} onClick={save}>Approve order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

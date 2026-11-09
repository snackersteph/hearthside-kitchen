import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { DISHES, dishById } from "@/lib/kitchen/data";
import { compareMealUrgency, conflictReasons, lineCost, type MealReview } from "@/lib/kitchen/engine";
import { MEALS, type Meal, type Proposal, type PurchaseProposal, type SubstitutionProposal } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar, MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { canApproveMeal, dateKey, scheduledState } from "@/lib/kitchen/schedule";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { needsDietaryReview } from "@/components/kitchen/approval-rules";

export const Route = createFileRoute("/approvals")({
  validateSearch: (search: Record<string, unknown>): { kind?: "purchase" | "substitution"; date?: string; meal?: Meal } => {
    const kind = search["kind"];
    const date = typeof search["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["date"]) ? search["date"] : undefined;
    const meal = MEALS.find((m) => m === search["meal"]);
    return { ...(kind === "purchase" || kind === "substitution" ? { kind } : {}), ...(date ? { date } : {}), ...(meal ? { meal } : {}) };
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
  const { kind, date, meal } = Route.useSearch();
  const navigate = Route.useNavigate();
  const proposals = analysis.proposals.filter((p) => (!kind || p.kind === kind) && (!date || (p.kind === "substitution" && p.serviceDate === date)) && (!meal || (p.kind === "substitution" && p.meal === meal)));
  const allReviews = kind === "purchase" ? [] : (analysis.mealReviews ?? []).filter((r) => needsDietaryReview(state, r) && (!date || r.serviceDate === date) && (!meal || r.meal === meal)).sort(compareMealUrgency);
  const reviews = allReviews.filter((r) => !r.approved);
  const approved = allReviews.filter((r) => r.approved);
  const purchases = proposals.filter((p) => p.kind === "purchase");
  const defaultTab = kind === "purchase" ? "orders" : date && meal && approved.length ? "approved" : "pending";
  const [tab, setTab] = useState(defaultTab);
  useEffect(() => { setTab(defaultTab); }, [defaultTab]);
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const now = Date.now();
  const history = state.history.filter((h) => (!kind || h.kind === kind) && (!date || h.serviceDate === date) && h.at >= now - range * 86400000).sort((x, y) => y.at - x.at);
  const subsFor = (r: MealReview) => proposals.filter((p): p is SubstitutionProposal => p.kind === "substitution" && p.serviceDate === r.serviceDate && p.meal === r.meal);
  return (
    <>
      <PageHeader eyebrow="Human in the loop" title={kind === "purchase" ? "Purchase Orders" : "Approval Center"} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Proposal type">
        <Button variant={!kind ? "default" : "outline"} onClick={() => navigate({ search: {} })}>All proposals</Button>
        <Button variant={kind === "purchase" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "purchase" } })}>Orders only</Button>
        <Button variant={kind === "substitution" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "substitution" } })}>Meals only</Button>
      </div>
      {date && <div className="mb-4 flex items-center gap-3 text-sm font-semibold">{date}{meal && ` · ${MEAL_LABEL[meal]}`}<Button size="sm" variant="ghost" onClick={() => navigate({ search: kind ? { kind } : {} })}>All dates</Button></div>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {kind !== "purchase" && <TabsTrigger value="pending">Meals to approve ({reviews.length})</TabsTrigger>}
          {kind !== "purchase" && <TabsTrigger value="approved">Approved meals ({approved.length})</TabsTrigger>}
          {kind !== "substitution" && <TabsTrigger value="orders">Purchase orders ({purchases.length})</TabsTrigger>}
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-6 space-y-3">
          {reviews.length === 0 ? <Empty text="No meals awaiting approval." /> : <>
            <p className="text-sm text-muted-foreground">Most urgent first — each meal must be signed off by the day before service.</p>
            {reviews.map((r) => <MealReviewCard key={r.serviceDate + r.meal} review={r} proposals={subsFor(r)} />)}
          </>}
        </TabsContent>
        <TabsContent value="approved" className="mt-6 space-y-3">
          {approved.length ? approved.map((r) => <MealReviewCard key={r.serviceDate + r.meal} review={r} proposals={[]} />) : <Empty text="No approved meals for this selection." />}
        </TabsContent>
        <TabsContent value="orders" className="mt-6 space-y-3">
          {purchases.length ? purchases.map((p) => <div key={p.id} className="rounded-lg border bg-card shadow-soft"><ProposalCard p={p} /></div>) : <Empty text="No purchase requests awaiting approval." />}
        </TabsContent>
        <TabsContent value="history" className="mt-6 space-y-3">
          <div className="flex gap-2" role="group" aria-label="History range">
            {([7, 14, 30] as const).map((d) => <Button key={d} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>{d === 7 ? "Past week" : d === 14 ? "Past 2 weeks" : "Past month"}</Button>)}
          </div>
          {history.length === 0 ? <Empty text="No decisions in this period." /> : (
            <ul className="divide-y rounded-xl border bg-card shadow-soft">
              {history.map((h) => (
                <li key={h.proposalId + h.at} className="flex items-center gap-3 px-5 py-4 text-sm">
                  <Tag tone={h.status === "approved" ? "ok" : "danger"}>{h.status}</Tag>
                  {h.modified && <Tag tone="warn">modified</Tag>}
                  <span className="flex-1">{h.summary}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
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

/** One consistent approve button everywhere: always the same vivid green, even when blocked. */
function ApproveButton({ disabled, reason, onClick, children }: { disabled?: boolean; reason?: string | undefined; onClick: () => void; children?: ReactNode }) {
  return (
    <Button size="sm" disabled={disabled} title={reason} onClick={onClick}
      className="bg-success text-success-foreground hover:bg-success/90 disabled:bg-success disabled:text-success-foreground disabled:opacity-100">
      <Check />{children ?? "Approve"}
    </Button>
  );
}

function MealReviewCard({ review: r, proposals }: { review: MealReview; proposals: SubstitutionProposal[] }) {
  const { dispatch } = useKitchen();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const timely = canApproveMeal(r.serviceDate);
  const ready = !r.pending && !r.unresolved && !r.rejected;
  const editable = !r.approved || r.serviceDate > dateKey(new Date());
  const blockReason = !timely ? `Past the ${r.approvalDueDate} deadline`
    : r.rejected ? "Choose a replacement first"
    : r.unresolved ? `${r.unresolved} resident${r.unresolved > 1 ? "s" : ""} still need a safe dish`
    : r.pending ? `${r.pending} alternative${r.pending > 1 ? "s" : ""} awaiting approval` : undefined;
  return <article id={`meal-${r.serviceDate}-${r.meal}`} className="scroll-mt-6 rounded-lg border bg-card p-4 shadow-soft">
    <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground">{r.serviceDate} · {MEAL_LABEL[r.meal]}</div>
      <Select value={r.mainDishId} disabled={!editable} onValueChange={(dishId) => {
        dispatch({ type: "setMealPlan", date: r.serviceDate, meal: r.meal, dishId, overrides: {} });
        toast("Meal updated — fresh approval required");
      }}>
        <SelectTrigger aria-label={`${r.serviceDate} ${MEAL_LABEL[r.meal]} main dish`} className="mt-2 h-auto min-h-12 w-full max-w-xl gap-3 whitespace-normal text-left font-display text-2xl font-semibold [&>span]:line-clamp-none [&>span]:break-words"><SelectValue /></SelectTrigger>
        <SelectContent>{DISHES.filter((dish) => dish.meal === r.meal).map((dish) => <SelectItem key={dish.id} value={dish.id}>{dish.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="mt-2 flex flex-wrap gap-2"><Tag tone={r.approved ? "ok" : "warn"}>{r.approved ? "Approved" : r.rejected ? "Rejected · replacement needed" : "Awaiting sign-off"}</Tag>{!r.approved && <Tag tone={timely ? "warn" : "danger"}>{timely ? `Due ${r.approvalDueDate}` : `Overdue · due ${r.approvalDueDate}`}</Tag>}
      <Tag tone={ready ? "ok" : "warn"}>{r.unresolved ? `${r.unresolved} unresolved residents` : r.pending ? `${r.pending} residents awaiting alternatives` : "Dietary checks clear"}</Tag></div>
    </div>
    <div className="flex flex-wrap gap-2">
      {!r.approved && <Button size="sm" variant="outline" onClick={() => setRejecting(true)}><X />Reject</Button>}
      {r.approved && <Button size="sm" variant="outline" disabled={!editable} onClick={() => setEditing(true)}><Pencil />Edit meal</Button>}
      {!r.approved && <ApproveButton disabled={!timely || !ready} reason={blockReason} onClick={() => { dispatch({ type: "approveMeal", date: r.serviceDate, meal: r.meal }); toast.success(`${MEAL_LABEL[r.meal]} approved for ${r.serviceDate}`); }} />}
    </div></div>
    {proposals.length > 0 && <div className="mt-4 space-y-3 border-t pt-4">{proposals.map((p) => <ProposalCard key={p.id} p={p} />)}</div>}
    {editing && <MealEditor review={r} onClose={() => setEditing(false)} />}
    {rejecting && <RejectMealDialog review={r} onClose={() => setRejecting(false)} />}
  </article>;
}

function MealEditor({ review: r, onClose }: { review: MealReview; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const reference = new Date();
  const offset = Math.round((new Date(`${r.serviceDate}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
  const dayState = scheduledState(state, offset, reference);
  const [dishId, setDishId] = useState(r.mainDishId);
  const [overrides, setOverrides] = useState(dayState.overrides[r.meal]);
  const dishes = DISHES.filter((d) => d.meal === r.meal);
  const unsafeOverrides = Object.entries(overrides).some(([id, did]) => {
    const resident = state.residents.find((person) => person.id === id);
    return !resident || conflictReasons(resident, dishById(did)).length > 0;
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{r.serviceDate} · {MEAL_LABEL[r.meal]}</DialogTitle></DialogHeader>
      <label className="text-sm font-semibold">Main dish</label>
      <Select value={dishId} onValueChange={(id) => { setDishId(id); setOverrides({}); }}><SelectTrigger aria-label="Meal main dish"><SelectValue /></SelectTrigger><SelectContent>{dishes.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
      <h3 className="mt-2 font-semibold">Resident alternatives</h3>
      <div className="divide-y">{state.residents.map((resident) => {
        const reasons = conflictReasons(resident, dishById(overrides[resident.id] ?? dishId));
        const safe = dishes.filter((d) => d.id !== dishId && !conflictReasons(resident, d).length);
        return <div key={resident.id} className="grid gap-2 py-3 sm:grid-cols-2">
          <div className="text-sm"><div className="font-medium">{resident.name}</div>{reasons.length > 0 && <div className="text-xs text-destructive">{reasons.join(", ")}</div>}</div>
          <Select value={overrides[resident.id] ?? "main"} onValueChange={(id) => setOverrides((current) => { const next = { ...current }; if (id === "main") delete next[resident.id]; else next[resident.id] = id; return next; })}>
            <SelectTrigger aria-label={`Alternative for ${resident.name}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="main">Main dish</SelectItem>{safe.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>;
      })}</div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={unsafeOverrides} onClick={() => { dispatch({ type: "setMealPlan", date: r.serviceDate, meal: r.meal, dishId, overrides }); toast("Meal updated — fresh approval required"); onClose(); }}>Save for review</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ProposalCard({ p }: { p: Proposal }) {
  const [editing, setEditing] = useState(false);
  const [selectedDish, setSelectedDish] = useState(p.kind === "substitution" ? p.dishId : "");
  const selected: Proposal = p.kind === "substitution" ? { ...p, dishId: selectedDish } : p;
  const agent = AGENTS[p.agent];
  return (
    <article className={cn("border-l-4 p-4", agent.border)}>
      <div className="flex flex-wrap items-start gap-4">
        <AgentAvatar agent={p.agent} />
        <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
          <div className="text-xs font-semibold text-muted-foreground">{agent.name} · {p.kind === "substitution" ? `${MEAL_LABEL[p.meal]} substitution` : "Purchase request"}</div>
          {selected.kind === "substitution" ? <SubBody p={selected} onDishChange={setSelectedDish} /> : <PurchaseBody p={selected} />}
        </div>
        <Actions p={selected} modified={p.kind === "substitution" && selectedDish !== p.dishId} onModify={() => setEditing(true)} />
      </div>
      {editing && (p.kind === "substitution" ? <RejectSubDialog p={p} onClose={() => setEditing(false)} /> : <PurchaseEditor p={p} onClose={() => setEditing(false)} />)}
    </article>
  );
}

function SubBody({ p, onDishChange }: { p: SubstitutionProposal; onDishChange: (id: string) => void }) {
  const { state } = useKitchen();
  const residents = state.residents.filter((resident) => p.residentIds.includes(resident.id));
  const late = !p.serviceDate || !canApproveMeal(p.serviceDate);
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2"><Tag>{p.serviceDate}</Tag><Tag tone={p.serviceDate && canApproveMeal(p.serviceDate) ? "warn" : "danger"}>Approval due {p.approvalDueDate}</Tag></div>
      <Select value={p.dishId} onValueChange={onDishChange} disabled={late}>
        <SelectTrigger aria-label={`Alternative dish for ${p.residentIds.map((id) => residentName(state, id)).join(", ")}`} className="mt-2 h-auto min-h-10 w-full max-w-lg whitespace-normal text-left text-base font-semibold [&>span]:line-clamp-none [&>span]:break-words"><SelectValue /></SelectTrigger>
        <SelectContent>{DISHES.filter((dish) => dish.meal === p.meal).map((dish) => <SelectItem key={dish.id} value={dish.id} disabled={residents.some((resident) => conflictReasons(resident, dish).length > 0)}>{dish.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="mt-1 text-xs text-muted-foreground">{p.residentIds.length} resident{p.residentIds.length > 1 ? "s" : ""}</div>
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

function Actions({ p, modified = false, onModify }: { p: Proposal; modified?: boolean; onModify: () => void }) {
  const { state, dispatch } = useKitchen();
  const late = p.kind === "substitution" && (!p.serviceDate || !canApproveMeal(p.serviceDate));
  const approve = () => {
    if (late) return;
    const summary = summarize(state, p, "Approved");
    if (p.kind === "substitution") dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified, summary });
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
      {p.kind === "substitution"
        ? <Button variant="outline" size="sm" onClick={onModify}><X /> Reject</Button>
        : <><Button variant="outline" size="sm" onClick={reject}><X /> Reject</Button><Button variant="outline" size="sm" onClick={onModify}><Pencil /> Modify</Button></>}
      <ApproveButton disabled={late} reason={late ? "Past the approval deadline" : undefined} onClick={approve} />
    </div>
  );
}

function RejectMealDialog({ review: r, onClose }: { review: MealReview; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const options = DISHES.filter((d) => d.meal === r.meal && d.id !== r.mainDishId);
  const [dishId, setDishId] = useState<string | null>(null);
  const replace = () => {
    if (!dishId) return;
    if (!r.rejected) dispatch({ type: "rejectMeal", date: r.serviceDate, meal: r.meal });
    dispatch({ type: "setMealPlan", date: r.serviceDate, meal: r.meal, dishId, overrides: {} });
    toast(`${MEAL_LABEL[r.meal]} replaced with ${dishById(dishId).name} — review again`); onClose();
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="font-display text-2xl">Reject {dishById(r.mainDishId).name}?</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{r.serviceDate} · {MEAL_LABEL[r.meal]}. Pick a replacement main dish:</p>
      <div className="space-y-2">{options.map((d) => {
        const bad = state.residents.filter((p) => conflictReasons(p, d).length).length;
        return <button key={d.id} type="button" onClick={() => setDishId(d.id)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm", dishId === d.id ? "border-primary bg-secondary" : "hover:border-primary")}>
          <span><span className="font-medium">{d.name}</span><span className="block text-xs text-muted-foreground">{d.description}</span></span>
          {bad ? <Tag tone="warn">{bad} need alternatives</Tag> : <Tag tone="ok">safe for all</Tag>}
        </button>;
      })}</div>
      <DialogFooter>
        <Button variant="outline" disabled={r.rejected} onClick={() => { dispatch({ type: "rejectMeal", date: r.serviceDate, meal: r.meal }); toast(`${MEAL_LABEL[r.meal]} rejected — replacement needed`); onClose(); }}>Reject without replacement</Button>
        <Button disabled={!dishId} onClick={replace}>Reject & use selected</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function RejectSubDialog({ p, onClose }: { p: SubstitutionProposal; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const chosen = state.residents.filter((r) => p.residentIds.includes(r.id));
  const options = DISHES.filter((d) => d.meal === p.meal && d.id !== p.fromDishId && d.id !== p.dishId);
  const [dishId, setDishId] = useState<string | null>(null);
  const late = !p.serviceDate || !canApproveMeal(p.serviceDate);
  const choose = () => {
    if (!dishId) return;
    const summary = `Rejected ${dishById(p.dishId).name}; approved ${dishById(dishId).name} for ${chosen.map((r) => r.name.split(" ")[0]).join(", ")} (${p.serviceDate} ${MEAL_LABEL[p.meal]})`;
    dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: true, summary });
    toast.success(summary); onClose();
  };
  const rejectOnly = () => {
    const summary = summarize(state, p, "Rejected");
    dispatch({ type: "reject", proposalId: p.id, kind: "substitution", summary, serviceDate: p.serviceDate });
    toast(summary); onClose();
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="font-display text-2xl">Reject {dishById(p.dishId).name}?</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Choose another alternative for {chosen.map((r) => r.name).join(", ")}:</p>
      <div className="space-y-2">{options.map((d) => {
        const bad = chosen.filter((r) => conflictReasons(r, d).length).length;
        return <button key={d.id} type="button" disabled={bad > 0} onClick={() => setDishId(d.id)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50", dishId === d.id ? "border-primary bg-secondary" : "hover:border-primary")}>
          <span className="font-medium">{d.name}</span>{bad ? <Tag tone="danger">unsafe for {bad}</Tag> : <Tag tone="ok">safe</Tag>}
        </button>;
      })}</div>
      <DialogFooter>
        <Button variant="outline" onClick={rejectOnly}>Reject without replacement</Button>
        <ApproveButton disabled={!dishId || late} reason={late ? "Past the approval deadline" : !dishId ? "Select a dish above" : undefined} onClick={choose}>Reject & use selected</ApproveButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
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
          <ApproveButton disabled={!deliveryDate || !lines.some((line) => line.qty > 0)} reason={!deliveryDate ? "Set an expected delivery date" : undefined} onClick={save}>Approve order</ApproveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

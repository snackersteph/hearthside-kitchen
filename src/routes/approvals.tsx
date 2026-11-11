import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Search, ChevronDown, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { DISHES, dishById } from "@/lib/kitchen/data";
import { conflictReasons, lineCost } from "@/lib/kitchen/engine";
import { MEALS, type Meal, type Proposal, type PurchaseProposal, type SubstitutionProposal } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar, MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { canApproveMeal, dateKey } from "@/lib/kitchen/schedule";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { alternativeOverview, residentApprovalCount } from "@/components/kitchen/approval-rules";
import { RememberApprovalDialog } from "@/components/kitchen/remember-approval-dialog";

export const Route = createFileRoute("/approvals")({
  validateSearch: (search: Record<string, unknown>): { kind?: "purchase" | "substitution"; date?: string; meal?: Meal; fromMenu?: boolean } => {
    const kind = search["kind"];
    const date = typeof search["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["date"]) ? search["date"] : undefined;
    const meal = MEALS.find((m) => m === search["meal"]);
    return { ...(kind === "purchase" || kind === "substitution" ? { kind } : {}), ...(date ? { date } : {}), ...(meal ? { meal } : {}), ...(search["fromMenu"] === true || search["fromMenu"] === "true" ? { fromMenu: true } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Approval Center · NutriSync" },
      { name: "description", content: "Review, modify and approve menu swaps and purchase requests from your kitchen agents." },
      { property: "og:title", content: "Approval Center · NutriSync" },
      { property: "og:description", content: "Review, modify and approve agent proposals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { state, analysis } = useKitchen();
  const { kind, date, meal, fromMenu } = Route.useSearch();
  const [origin] = useState(() => fromMenu && date && meal ? { date, meal } : null);
  const navigate = Route.useNavigate();
  const proposals = analysis.proposals.filter((p) => (!kind || p.kind === kind) && (!date || (p.kind === "substitution" && p.serviceDate === date)) && (!meal || (p.kind === "substitution" && p.meal === meal)));
  const today = dateKey(new Date());
  const overview = useMemo(() => alternativeOverview(state, new Date(), date ? [date] : undefined), [state, date, today]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const ingredientNames = (ids: string[]) => ids.map((id) => state.ingredients.find((i) => i.id === id)?.name ?? id).join(" ");
  const matches = (p: Proposal) => {
    if (!q) return true;
    const text = p.kind === "substitution"
      ? [dishById(p.dishId)?.name, dishById(p.fromDishId)?.name, p.meal, p.serviceDate, ...p.residentIds.map((id) => residentName(state, id)), ...Object.values(p.reasons).flat()].join(" ")
      : [p.vendor, p.deliveryDate, ingredientNames(p.lines.map((l) => l.ingredientId))].join(" ");
    return text.toLowerCase().includes(q);
  };
  const reviews = kind === "purchase" ? [] : overview.flatMap((day) => day.pending).filter((p) => (!meal || p.meal === meal) && matches(p)).sort((a, b) => (a.serviceDate ?? "").localeCompare(b.serviceDate ?? "") || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const approved = kind === "purchase" ? [] : overview.flatMap((day) => day.approved).filter((p) => (!meal || p.meal === meal) && matches(p));
  const purchases = proposals.filter((p): p is PurchaseProposal => p.kind === "purchase" && matches(p));
  const defaultTab = kind === "purchase" ? "orders" : "pending";
  const [tab, setTab] = useState(defaultTab);
  useEffect(() => { setTab(defaultTab); }, [defaultTab]);
  useEffect(() => {
    const id = window.location.hash.replace(/^#proposal-/, "");
    if (!id || id === window.location.hash) return;
    if (approved.some((p) => p.id === id)) setTab("approved");
    else if (reviews.some((p) => p.id === id)) setTab("pending");
    const t = window.setTimeout(() => {
      const el = document.getElementById(`proposal-${id}`);
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("ring-2", "ring-primary"); window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2500); }
    }, 100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [approvalRequest, setApprovalRequest] = useState<SubstitutionProposal | null>(null);
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [historyKind, setHistoryKind] = useState<"all" | "substitution" | "purchase">("all");
  const now = Date.now();
  const history = state.history.filter((h) => (!kind || h.kind === kind) && (!date || h.serviceDate === date) && h.at >= now - range * 86400000 && (kind || historyKind === "all" || h.kind === historyKind) && (!q || h.summary.toLowerCase().includes(q))).sort((x, y) => y.at - x.at);
  return (
    <>
      {origin && <Button asChild variant="ghost" size="sm" className="mb-5"><Link to="/menu/$date" params={{ date: origin.date }} search={{ meal: origin.meal, focus: true }}><ArrowLeft />Back to {MEAL_LABEL[origin.meal].toLowerCase()} menu</Link></Button>}
      <PageHeader eyebrow="Human in the loop" title={kind === "purchase" ? "Purchase Orders" : "Approval Center"} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Proposal type">
        <Button variant={!kind ? "default" : "outline"} onClick={() => navigate({ search: {} })}>All proposals</Button>
        <Button variant={kind === "substitution" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "substitution" } })}>Meals only</Button>
        <Button variant={kind === "purchase" ? "default" : "outline"} onClick={() => navigate({ search: { kind: "purchase" } })}>Orders only</Button>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search residents, dishes, vendors…" aria-label="Search approvals" className="pl-9" />
        </div>
      </div>
      {date && <div className="mb-4 flex items-center gap-3 text-sm font-semibold">{date}{meal && ` · ${MEAL_LABEL[meal]}`}<Button size="sm" variant="ghost" onClick={() => navigate({ search: kind ? { kind } : {} })}>All dates</Button></div>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {kind !== "purchase" && <TabsTrigger value="pending">Residents to approve ({residentApprovalCount(reviews)})</TabsTrigger>}
          {kind !== "purchase" && <TabsTrigger value="approved">Approved residents ({residentApprovalCount(approved)})</TabsTrigger>}
          {kind !== "substitution" && <TabsTrigger value="orders">Purchase orders to approve ({purchases.length})</TabsTrigger>}
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-6 space-y-3">
          {reviews.length === 0 ? <Empty text="No alternatives awaiting approval." /> : <>
            <p className="text-sm text-muted-foreground">Most urgent first</p>
            {reviews.map((p) => <ProposalCard key={p.id} p={p} onApprove={setApprovalRequest} />)}
          </>}
        </TabsContent>
        <TabsContent value="approved" className="mt-6 space-y-3">
          {approved.length ? approved.map((p) => <ProposalCard key={p.id} p={p} onApprove={setApprovalRequest} />) : <Empty text="No approved alternatives for this selection." />}
        </TabsContent>
        <TabsContent value="orders" className="mt-6 space-y-3">
          {purchases.length ? purchases.map((p) => <div key={p.id} className="rounded-lg border bg-card shadow-soft"><ProposalCard p={p} onApprove={setApprovalRequest} /></div>) : <Empty text="No purchase requests awaiting approval." />}
        </TabsContent>
        <TabsContent value="history" className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2" role="group" aria-label="History range">
              {([7, 14, 30] as const).map((d) => <Button key={d} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>{d === 7 ? "Past week" : d === 14 ? "Past 2 weeks" : "Past month"}</Button>)}
            </div>
            {!kind && <div className="ml-auto flex gap-1 rounded-lg border bg-muted p-1" role="group" aria-label="History type">
              {([["all", "All"], ["substitution", "Meals"], ["purchase", "Orders"]] as const).map(([k, l]) => <Button key={k} size="sm" variant={historyKind === k ? "default" : "ghost"} onClick={() => setHistoryKind(k)}>{l}</Button>)}
            </div>}
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
      {approvalRequest && <RememberApprovalDialog p={approvalRequest} onApproved={() => setTab("pending")} onClose={() => setApprovalRequest(null)} />}
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

function ProposalCard({ p, onApprove }: { p: Proposal; onApprove: (p: SubstitutionProposal) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rejectionRequest, setRejectionRequest] = useState<SubstitutionProposal | null>(null);
  const [selectedDish, setSelectedDish] = useState(p.kind === "substitution" ? p.dishId : "");
  const selected: Proposal = p.kind === "substitution" ? { ...p, dishId: selectedDish } : p;
  const agent = AGENTS[p.agent];
  if (p.kind === "substitution" && p.approved && !expanded) return <article id={`proposal-${p.id}`} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 bg-card p-4", agent.border)}>
    <div><Tag tone="ok">Approved</Tag><div className="mt-2 font-semibold">{p.serviceDate} · {MEAL_LABEL[p.meal]} · {dishById(p.dishId).name}</div><div className="mt-1 text-sm text-muted-foreground">{p.residentIds.length} residents</div></div>
    <Button variant="outline" size="sm" onClick={() => setExpanded(true)}><ChevronDown />View</Button>
  </article>;
  return (
    <article id={`proposal-${p.id}`} className={cn("scroll-mt-24 transition-shadow", "rounded-lg border border-l-4 bg-card p-4 shadow-soft", agent.border)}>
      <div className="flex flex-wrap items-start gap-4">
        <AgentAvatar agent={p.agent} />
        <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-xs font-semibold text-muted-foreground">{agent.name} · {p.kind === "substitution" ? `${MEAL_LABEL[p.meal]} substitution` : "Purchase request"}</div>
            <Actions p={selected} onApprove={onApprove} onModify={() => setEditing(true)} />
          </div>
          {selected.kind === "substitution" ? <SubBody p={selected} onDishChange={setSelectedDish} onApprove={onApprove} onReject={setRejectionRequest} /> : <PurchaseBody p={selected} />}
        </div>
      </div>
      {editing && (p.kind === "substitution" ? <RejectSubDialog p={p} onApprove={onApprove} onClose={() => setEditing(false)} /> : <PurchaseEditor p={p} onClose={() => setEditing(false)} />)}
      {rejectionRequest && <RejectSubDialog p={rejectionRequest} onApprove={onApprove} onClose={() => setRejectionRequest(null)} />}
    </article>
  );
}

function SubBody({ p, onDishChange, onApprove, onReject }: { p: SubstitutionProposal; onDishChange: (id: string) => void; onApprove: (p: SubstitutionProposal) => void; onReject: (p: SubstitutionProposal) => void }) {
  const { state } = useKitchen();
  const residents = state.residents.filter((resident) => p.residentIds.includes(resident.id));
  const locked = Boolean(p.approved && (!p.serviceDate || p.serviceDate <= dateKey(new Date())));
  return (
    <>
      <div className="mt-2 text-xl font-semibold tracking-tight">Serve date: {p.serviceDate}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Replaces the main menu dish <span className="font-medium text-foreground">{dishById(p.fromDishId).name}</span> for these residents
      </p>
      <div className="mt-2 flex flex-wrap gap-2">{p.approved ? <Tag tone="ok">Approved</Tag> : <Tag tone={p.serviceDate && canApproveMeal(p.serviceDate) ? "warn" : "danger"}>Approval due {p.approvalDueDate}</Tag>}</div>
      <Select value={p.dishId} onValueChange={onDishChange} disabled={locked}>
        <SelectTrigger aria-label={`Alternative dish for ${p.residentIds.map((id) => residentName(state, id)).join(", ")}`} className="mt-2 h-auto min-h-10 w-full max-w-lg whitespace-normal text-left text-base font-semibold [&>span]:line-clamp-none [&>span]:break-words"><SelectValue /></SelectTrigger>
        <SelectContent>{DISHES.filter((dish) => dish.meal === p.meal).map((dish) => <SelectItem key={dish.id} value={dish.id} disabled={residents.some((resident) => conflictReasons(resident, dish).length > 0)}>{dish.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="mt-1 text-xs text-muted-foreground">{p.residentIds.length} resident{p.residentIds.length > 1 ? "s" : ""}</div>
      <ul className="mt-4 grid gap-2 xl:grid-cols-2">
        {p.residentIds.map((id) => (
          <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2" aria-label={`Decision for ${residentName(state, id)}`}>
            <Link to="/residents/$residentId" params={{ residentId: id }} search={{ approval: p.id }} className="min-w-0 flex-1 basis-40 text-sm transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-medium underline-offset-2 hover:underline">{residentName(state, id)}</span>
              <span className="text-muted-foreground"> — {p.reasons[id]?.join(", ")}</span>
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={locked} aria-label={`Reject for ${residentName(state, id)}`} onClick={() => onReject({ ...p, residentIds: [id] })}><X />Reject</Button>
              <ApproveButton disabled={locked} onClick={() => onApprove({ ...p, residentIds: [id] })}>Approve</ApproveButton>
            </div>
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

function Actions({ p, onModify, onApprove }: { p: Proposal; onModify: () => void; onApprove: (p: SubstitutionProposal) => void }) {
  const { state, dispatch } = useKitchen();
  const late = p.kind === "substitution" && (!p.serviceDate || !canApproveMeal(p.serviceDate));
  const approve = () => {
    const summary = summarize(state, p, "Approved");
    if (p.kind === "substitution") { onApprove(p); return; }
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
        ? <Button variant="outline" size="sm" disabled={late} onClick={onModify}><X /> Reject all</Button>
        : <><Button variant="outline" size="sm" onClick={reject}><X /> Reject</Button><Button variant="outline" size="sm" onClick={onModify}><Pencil /> Modify</Button></>}
      <ApproveButton disabled={late} reason={late ? "Past the approval deadline" : undefined} onClick={approve}>{p.kind === "substitution" ? "Approve all" : "Approve"}</ApproveButton>
    </div>
  );
}

function RejectSubDialog({ p, onClose, onApprove }: { p: SubstitutionProposal; onClose: () => void; onApprove: (p: SubstitutionProposal) => void }) {
  const { state, dispatch } = useKitchen();
  const chosen = state.residents.filter((r) => p.residentIds.includes(r.id));
  const options = DISHES.filter((d) => d.meal === p.meal && d.id !== p.fromDishId && d.id !== p.dishId);
  const [dishId, setDishId] = useState<string | null>(null);
  const late = !p.serviceDate || !canApproveMeal(p.serviceDate);
  const choose = () => {
    if (!dishId) return;
    onApprove({ ...p, dishId }); onClose();
  };
  const rejectOnly = () => {
    const summary = summarize(state, p, "Rejected");
    dispatch({ type: "rejectSub", proposalId: p.id, meal: p.meal, fromDishId: p.fromDishId, dishId: p.dishId, residentIds: p.residentIds, summary, serviceDate: p.serviceDate });
    toast(summary); onClose();
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display text-2xl">Reject {dishById(p.dishId).name}?</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Choose another alternative for {chosen.map((r) => r.name).join(", ")}:</p>
      <div className="space-y-2">{options.map((d) => {
        const bad = chosen.filter((r) => conflictReasons(r, d).length).length;
        return <Button variant="outline" key={d.id} type="button" disabled={bad > 0} onClick={() => setDishId(d.id)} className={cn("flex h-auto w-full items-center justify-between whitespace-normal rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50", dishId === d.id ? "border-primary bg-secondary" : "hover:border-primary")}>
          <span className="font-medium">{d.name}</span>{bad ? <Tag tone="danger">unsafe for {bad}</Tag> : <Tag tone="ok">safe</Tag>}
        </Button>;
      })}</div>
      <DialogFooter>
        <Button variant="outline" disabled={late} onClick={rejectOnly}>Reject without replacement</Button>
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

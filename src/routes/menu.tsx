import { createFileRoute, Link } from "@tanstack/react-router";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { DISHES, dishById } from "@/lib/kitchen/data";
import { MEALS, type Meal } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, MEAL_LABEL, MEAL_TIME, Tag } from "@/components/kitchen/agents";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { canApproveMeal, dateKey, dayAt, scheduledState } from "@/lib/kitchen/schedule";
import { Button } from "@/components/ui/button";
import { analyzeMenuDay } from "@/lib/kitchen/engine";

const MEAL_BG: Record<Meal, string> = { breakfast: "bg-meal-breakfast", lunch: "bg-meal-lunch", dinner: "bg-meal-dinner" };

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Daily Menu · Hearth Kitchen Command" },
      { name: "description", content: "Breakfast, lunch and dinner with agent-proposed alternatives for every dietary need." },
      { property: "og:title", content: "Daily Menu · Hearth Kitchen Command" },
      { property: "og:description", content: "Breakfast, lunch and dinner with agent-proposed alternatives." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [offset, setOffset] = useState(0);
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => { setReference(new Date()); }, []);
  return (
    <>
      <PageHeader eyebrow="Today" title="Daily Menu" />

      {reference ? <WeekCalendar offset={offset} onChange={setOffset} reference={reference} /> : <div className="mb-6 h-32" />}
      {reference && <div className="space-y-6">{MEALS.map((m) => offset < 0
        ? <PlannedMeal key={m} meal={m} offset={offset} reference={reference} />
        : <MealSection key={m} meal={m} offset={offset} reference={reference} />)}</div>}
    </>
  );
}

function MealSection({ meal, offset, reference }: { meal: Meal; offset: number; reference: Date }) {
  const { state: kitchen, analysis: allAnalysis, dispatch } = useKitchen();
  const state = scheduledState(kitchen, offset, reference);
  const analysis = analyzeMenuDay(kitchen, offset, reference);
  const date = dateKey(dayAt(offset, reference));
  const review = allAnalysis.mealReviews?.find((r) => r.serviceDate === date && r.meal === meal);
  const timely = canApproveMeal(date, reference);
  const main = dishById(state.plan[meal]);
  const approved = new Map<string, string[]>();
  for (const [rid, did] of Object.entries(state.overrides[meal])) approved.set(did, [...(approved.get(did) ?? []), rid]);
  const pending = analysis.proposals.filter((p) => p.kind === "substitution" && p.meal === meal);
  const unresolved = analysis.conflicts.filter((c) => c.meal === meal && c.status === "needs-staff");
  const mainCount = Object.values(analysis.served[meal]).filter((d) => d === main.id).length;

  return (
    <section className={cn("overflow-hidden rounded-2xl border shadow-soft", MEAL_BG[meal])}>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_320px]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{MEAL_LABEL[meal]} · {MEAL_TIME[meal]}</div>
          <h2 className="mt-1 text-2xl font-semibold">{main.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{main.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {main.allergens.map((a) => <Tag key={a} tone="danger">{a}</Tag>)}
            {main.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
          <div className="mt-4 text-sm"><span className="font-display text-2xl font-semibold">{mainCount}</span> <span className="text-muted-foreground">of {state.residents.length} residents on the main dish</span></div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Main dish</label>
          <Select value={main.id} onValueChange={(v) => {
            dispatch(offset === 0 ? { type: "setMain", meal, dishId: v } : { type: "setScheduledMain", date, meal, dishId: v });
            toast(`${MEAL_LABEL[meal]} changed — approval needs review`);
          }}>
            <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>{DISHES.filter((d) => d.meal === meal).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag tone={review?.approved ? "ok" : timely ? "warn" : "danger"}>{review?.approved ? "Approved in advance" : timely ? `Approval due ${review?.approvalDueDate}` : "Approval overdue"}</Tag>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/approvals" search={{ kind: "substitution", date }}>Review {MEAL_LABEL[meal].toLowerCase()} <ChevronRight /></Link></Button>
        </div>
      </div>

      {(approved.size > 0 || pending.length > 0 || unresolved.length > 0) && (
        <div className="grid gap-3 border-t border-foreground/10 p-6 md:grid-cols-2">
          {[...approved.entries()].map(([did, rids]) => (
            <div key={did} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between"><Tag tone="ok">Approved alternative</Tag><span className="text-xs text-muted-foreground">{rids.length} residents</span></div>
              <div className="mt-2 font-semibold">{dishById(did).name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{rids.map((r) => residentName(state, r)).join(", ")}</div>
            </div>
          ))}
          {pending.map((p) => p.kind === "substitution" && (
            <Link to="/approvals" search={{ kind: "substitution", date }} key={p.id} className="rounded-xl border border-dashed border-agent-menu bg-card p-4 transition hover:bg-agent-menu-soft">
              <div className="flex items-center gap-2"><AgentAvatar agent="menu" size="sm" /><Tag tone="warn">Proposed · awaiting approval</Tag></div>
              <div className="mt-2 font-semibold">{dishById(p.dishId).name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{p.residentIds.map((r) => residentName(state, r)).join(", ")}</div>
            </Link>
          ))}
          {unresolved.map((c) => (
            <div key={c.residentId} className="rounded-xl border border-destructive/40 bg-danger-soft p-4 text-sm">
              <div className="font-semibold text-destructive">{residentName(state, c.residentId)} — no safe option</div>
              <div className="text-destructive/80">{dishById(c.dishId).name}: {c.reasons.join(", ")}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WeekCalendar({ offset, onChange, reference }: { offset: number; onChange: (o: number) => void; reference: Date }) {
  const days = Array.from({ length: 15 }, (_, i) => i - 7);
  return (
    <div className="mb-6 rounded-2xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4" />{dayAt(offset, reference).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{offset === 0 && <Tag tone="ok">Today</Tag>}</div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous day" disabled={offset <= -7} onClick={() => onChange(offset - 1)}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => onChange(0)}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Next day" disabled={offset >= 7} onClick={() => onChange(offset + 1)}><ChevronRight /></Button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <div className="grid min-w-[540px] grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
        {days.map((o) => { const d = dayAt(o, reference); return (
          <Button variant={o === offset ? "default" : "ghost"} aria-label={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} aria-pressed={o === offset} key={o} onClick={() => onChange(o)} className={cn("h-14 flex-col gap-0 px-0 py-2 text-center", o === 0 && o !== offset && "ring-1 ring-primary")}>
            <div className="text-[10px] uppercase opacity-70">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
            <div className="text-sm font-semibold">{d.getDate()}</div>
          </Button>); })}
      </div>
      </div>
    </div>
  );
}

function PlannedMeal({ meal, offset, reference }: { meal: Meal; offset: number; reference: Date }) {
  const { state, dispatch } = useKitchen();
  const dish = dishById(scheduledState(state, offset, reference).plan[meal]);
  const date = dateKey(dayAt(offset, reference));
  return (
    <section className={cn("rounded-2xl border p-6 shadow-soft", MEAL_BG[meal])}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{MEAL_LABEL[meal]} · {MEAL_TIME[meal]} · {offset < 0 ? "Served" : "Planned"}</div>
      <h2 className="mt-1 text-2xl font-semibold">{dish.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{dish.description}</p>
      {offset > 0 && (
        <div className="mt-4 max-w-sm">
          <label htmlFor={`planned-${meal}`} className="text-xs font-semibold text-muted-foreground">Main dish</label>
          <Select value={dish.id} onValueChange={(dishId) => {
            dispatch({ type: "setScheduledMain", date, meal, dishId });
            toast(`${MEAL_LABEL[meal]} updated for ${dayAt(offset, reference).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
          }}>
            <SelectTrigger id={`planned-${meal}`} aria-label={`${MEAL_LABEL[meal]} main dish`} className="mt-1 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>{DISHES.filter((d) => d.meal === meal).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {dish.allergens.map((a) => <Tag key={a} tone="danger">{a}</Tag>)}
        {dish.tags.map((t) => <Tag key={t}>{t}</Tag>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{offset < 0 ? "Sample past menu (view only)." : "Sample rotating plan · dietary alternatives included in the inventory forecast."}</p>
    </section>
  );
}

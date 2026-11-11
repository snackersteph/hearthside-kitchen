import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, CircleCheck, PackageCheck, PackageX, Truck, UserRound, Users, BookOpen, Utensils, Scale, DollarSign } from "lucide-react";
import { useKitchen, useWeeklyPurchasing } from "@/lib/kitchen/store";
import { alternativeOverview, residentApprovalCount } from "@/components/kitchen/approval-rules";
import { stockOrderEstimate } from "@/lib/kitchen/stock-orders";
import { dishById } from "@/lib/kitchen/data";
import { MEALS } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { MEAL_LABEL, MEAL_TIME } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { dateKey, scheduledState } from "@/lib/kitchen/schedule";
import { actionCards, dailySnapshot, openObservations, reviewedObservations } from "@/lib/kitchen/overview";
import { ActionCardTile } from "@/components/kitchen/action-card";
import { ObservationDialog } from "@/components/kitchen/observation-dialog";
import { WeeklyWorkstreams } from "@/components/kitchen/weekly-workstreams";
import { ResidentPhoto } from "@/components/kitchen/resident-photo";
import { cn } from "@/lib/utils";
import { useAccountData } from "@/lib/account";
import { recipePhoto } from "@/lib/kitchen/recipe-photos";

const CARD_ICONS = { approvals: ClipboardCheck, shortfalls: PackageX, delivered: PackageCheck, incoming: Truck, profiles: UserRound } as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kitchen Pulse · NutriSync" },
      { name: "description", content: "Today's meals, dietary issues and live agent activity at a glance." },
      { property: "og:title", content: "Kitchen Pulse · NutriSync" },
      { property: "og:description", content: "Today's meals, dietary issues and live agent activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const account = useAccountData(false);
  const { state, analysis, dispatch } = useKitchen();
  const weeklyRequests = useWeeklyPurchasing().reduce((n, w) => n + w.proposals.length, 0);
  // Same totals as the sidebar badge and the Inventory "Stock alert" tab.
  const approvals = residentApprovalCount(alternativeOverview(state, new Date()).flatMap((d) => d.pending)) + analysis.proposals.filter((p) => p.kind === "purchase").length + weeklyRequests;
  const forecast = analysis.forecast;
  const stockAlerts = state.ingredients.filter((i) => Boolean(forecast?.firstShortDate[i.id]) || (stockOrderEstimate(state, i.id, forecast?.demand[i.id] ?? 0)?.qty ?? 0) > 0).length;
  const cards = actionCards(state, analysis, new Date(), { approvals, stockAlerts });
  const snapshot = dailySnapshot(state, analysis);
  const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const quantity = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const facts = [
    { label: "Residents", value: snapshot.residents, detail: "Residents served today", icon: Users },
    { label: "Recipes", value: snapshot.recipes, detail: "Recipes on file", icon: BookOpen },
    { label: "Meals", value: snapshot.meals, detail: "Breakfast, lunch & dinner", icon: Utensils },
    { label: "Planned consumption", value: `${quantity(snapshot.quantities["kg"] ?? 0)} kg · ${quantity(snapshot.quantities["L"] ?? 0)} L`, detail: Object.entries(snapshot.quantities).filter(([unit, qty]) => unit !== "kg" && unit !== "L" && qty > 0).map(([unit, qty]) => `${quantity(qty)} ${unit}`).join(" · ") || "Today's menu estimate", icon: Scale },
    { label: "Food cost", value: money(snapshot.cost), detail: `${money(snapshot.costPerResident)} / resident${snapshot.unpriced ? " · some prices missing" : " · ingredients only"}`, icon: DollarSign },
  ];
  const dayState = scheduledState(state, 0);
  const todayKey = dateKey(new Date());
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const open = openObservations(state);
  const reviewed = reviewedObservations(state);
  const [logging, setLogging] = useState(false);
  const residentOf = (id: string) => state.residents.find((r) => r.id === id);

  return (
    <div className="kitchen-pulse">
      <PageHeader eyebrow={today} title={`Good evening, ${account.data?.profile?.display_name || "Chef"}.`} />

      <section className="pulse-snapshot" aria-label="Daily snapshot">
        <h2>Today's snapshot</h2>
        <dl className="pulse-facts">{facts.map((fact) => <div key={fact.label} className="pulse-fact" title={fact.detail}>
          <fact.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="font-display text-[15px] font-semibold">{fact.value}</dd>
        </div>)}</dl>
      </section>

      <WeeklyWorkstreams />

      <section className="pulse-actions" aria-label="Kitchen action items">
        <h2 className="text-xl font-semibold">Needs your attention</h2>
        {cards.map((card) => (
          <ActionCardTile
            key={card.id}
            card={card}
            icon={CARD_ICONS[card.id]}
          />
        ))}
      </section>

      <div className="pulse-content">
        <div className="pulse-content-inner">
        <section className="pulse-service">
          <h2 className="mb-3 text-xl font-semibold">Today's service</h2>
          <div className="space-y-3">
            {MEALS.map((meal) => {
              const main = dishById(dayState.plan[meal]);
              const served = analysis.served[meal];
              const alt = Object.entries(dayState.overrides[meal]).length;
              const pend = analysis.conflicts.filter((c) => c.meal === meal && c.status === "proposal-pending").length;
              const bad = analysis.conflicts.filter((c) => c.meal === meal && c.status === "needs-staff").length;
              const mainCount = Object.values(served).filter((d) => d === main.id).length;
              return (
                <Link key={meal} to="/menu/$date" params={{ date: todayKey }} search={{ meal, focus: true }} className="pulse-service-link border bg-card transition hover:border-primary">
                  <img src={recipePhoto(main.id, main.name)} alt={main.name} className="pulse-service-photo" />
                  <div className="pulse-service-time">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{MEAL_LABEL[meal]}</div>
                    <div className="text-sm text-muted-foreground">{MEAL_TIME[meal]}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg font-semibold">{main.name}</div>
                    <div className="text-sm text-muted-foreground">{mainCount} on main · {alt} on approved alternatives</div>
                  </div>
                  <div className="pulse-service-status">
                    {pend > 0 && <span className="rounded-full bg-agent-menu-soft px-2 py-0.5 text-agent-menu">{pend} pending swap</span>}
                    {bad > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-destructive">{bad} unresolved</span>}
                    {!pend && !bad && <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">All safe</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

          <section className="pulse-observations">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Observation board</h2>
                <p className="text-sm text-muted-foreground">Reactions reported after a resident ate a specific meal.</p>
              </div>
              <div className="flex gap-2">
                {open.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => open.forEach((o) => dispatch({ type: "reviewObservation", id: o.id }))}>
                    Mark all reviewed
                  </Button>
                )}
                <Button size="sm" onClick={() => setLogging(true)}>Log a reaction</Button>
              </div>
            </div>

            {open.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-success/35 bg-success-soft/45 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><CircleCheck className="h-5 w-5" /></span>
                <div>
                  <div className="font-semibold text-success">No reactions to review</div>
                  <div className="text-sm text-muted-foreground">Every resident ate without incident. Reactions you log will appear here.</div>
                </div>
              </div>
            ) : (
              <ul className="divide-y rounded-xl border bg-card shadow-soft">
                {open.map((o) => {
                  const resident = residentOf(o.residentId);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                      {resident && <ResidentPhoto resident={resident} className="h-10 w-10" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {resident?.name ?? o.residentId}
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", o.severity === "concern" ? "bg-danger-soft text-destructive" : "bg-muted text-muted-foreground")}>
                            {o.severity === "concern" ? "Needs follow-up" : "Note only"}
                          </span>
                        </div>
                        <div className="text-sm">{o.reaction}</div>
                        <div className="text-xs text-muted-foreground">{MEAL_LABEL[o.meal]} · {dishById(o.dishId).name} · served {o.serviceDate}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => dispatch({ type: "reviewObservation", id: o.id })}>Mark reviewed</Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {reviewed.length > 0 && (
              <details className="mt-3 rounded-xl border bg-card p-4 shadow-soft">
                <summary className="cursor-pointer text-sm font-medium">Reviewed reactions ({reviewed.length})</summary>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {reviewed.map((o) => (
                    <li key={o.id}>{residentOf(o.residentId)?.name ?? o.residentId} — {o.reaction} ({MEAL_LABEL[o.meal]}, {o.serviceDate})</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>

      </div>

      {logging && <ObservationDialog onClose={() => setLogging(false)} />}
    </div>
  );
}

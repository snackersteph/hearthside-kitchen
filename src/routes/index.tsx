import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, CircleCheck, PackageX, Truck, UserRound } from "lucide-react";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { MEALS } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, AgentChip, MEAL_LABEL, MEAL_TIME } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { scheduledState } from "@/lib/kitchen/schedule";
import { actionCards, openObservations, reviewedObservations } from "@/lib/kitchen/overview";
import { ActionCardTile } from "@/components/kitchen/action-card";
import { ObservationDialog } from "@/components/kitchen/observation-dialog";
import { ResidentPhoto } from "@/components/kitchen/resident-photo";
import { cn } from "@/lib/utils";

const CARD_ICONS = { approvals: ClipboardCheck, shortfalls: PackageX, incoming: Truck, profiles: UserRound } as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center · NutriSync" },
      { name: "description", content: "Today's meals, dietary issues and live agent activity at a glance." },
      { property: "og:title", content: "Command Center · NutriSync" },
      { property: "og:description", content: "Today's meals, dietary issues and live agent activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const { state, analysis, dispatch } = useKitchen();
  const needsStaff = analysis.conflicts.filter((c) => c.status === "needs-staff");
  const cards = actionCards(state, analysis);
  const dayState = scheduledState(state, 0);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const open = openObservations(state);
  const reviewed = reviewedObservations(state);
  const [logging, setLogging] = useState(false);
  const residentOf = (id: string) => state.residents.find((r) => r.id === id);

  return (
    <>
      <PageHeader eyebrow={today} title="Good evening, Chef." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <ActionCardTile
            key={card.id}
            card={card}
            icon={CARD_ICONS[card.id]}
            reviewLabel={card.id === "profiles" ? "Mark reviewed" : undefined}
            onReview={card.id === "profiles" ? () => dispatch({ type: "markProfileUpdatesSeen" }) : undefined}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
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
                <Link key={meal} to="/menu" className="flex items-center gap-5 rounded-xl border bg-card p-5 shadow-soft transition hover:border-primary">
                  <div className="w-20 shrink-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{MEAL_LABEL[meal]}</div>
                    <div className="text-sm text-muted-foreground">{MEAL_TIME[meal]}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg font-semibold">{main.name}</div>
                    <div className="text-sm text-muted-foreground">{mainCount} on main · {alt} on approved alternatives</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs font-semibold">
                    {pend > 0 && <span className="rounded-full bg-agent-menu-soft px-2 py-0.5 text-agent-menu">{pend} pending swap</span>}
                    {bad > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-destructive">{bad} unresolved</span>}
                    {!pend && !bad && <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">All safe</span>}
                  </div>
                </Link>
              );
            })}
          </div>

          <section className="mt-8">
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
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">Agent channel</h2>
          <div className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="mb-4 text-xs text-muted-foreground">Live shared context — each agent picks up where the other left off.</p>
            <ol className="space-y-4">
              {analysis.messages.map((m) => (
                <li key={m.id} className="flex gap-3">
                  <AgentAvatar agent={m.agent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <AgentChip agent={m.agent} />
                      {m.to && <><ArrowRight className="h-3 w-3 text-muted-foreground" /><AgentChip agent={m.to} /></>}
                      {m.meal && <span className="text-muted-foreground">· {MEAL_LABEL[m.meal]}</span>}
                    </div>
                    <p className={`mt-1 text-sm leading-relaxed ${m.tone === "ok" ? "text-muted-foreground" : "text-foreground"}`}>{m.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            {needsStaff.length > 0 && (
              <div className="mt-5 rounded-lg bg-danger-soft p-3 text-sm text-destructive">
                <div className="font-semibold">Needs your attention</div>
                {needsStaff.map((c) => <div key={c.meal + c.residentId}>{residentName(state, c.residentId)} — {MEAL_LABEL[c.meal]} ({c.reasons.join(", ")})</div>)}
              </div>
            )}
          </div>
        </section>
      </div>

      {logging && <ObservationDialog onClose={() => setLogging(false)} />}
    </>
  );
}

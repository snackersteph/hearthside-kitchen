import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ClipboardCheck, PackageX, Users } from "lucide-react";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { MEALS } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar, AgentChip, MEAL_LABEL, MEAL_TIME } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center · Hearth Kitchen Command" },
      { name: "description", content: "Today's meals, dietary issues and live agent activity at a glance." },
      { property: "og:title", content: "Command Center · Hearth Kitchen Command" },
      { property: "og:description", content: "Today's meals, dietary issues and live agent activity at a glance." },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const { state, analysis } = useKitchen();
  const needsStaff = analysis.conflicts.filter((c) => c.status === "needs-staff");
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const stats = [
    { label: "Residents served", value: state.residents.length, icon: Users, sub: "3 meals planned" },
    { label: "Dietary conflicts", value: analysis.conflicts.length, icon: AlertTriangle, sub: needsStaff.length ? `${needsStaff.length} need staff` : "all have proposals" },
    { label: "Awaiting approval", value: analysis.proposals.length, icon: ClipboardCheck, sub: "agent proposals" },
    { label: "Ingredient shortfalls", value: purchases.reduce((n, p) => n + p.lines.length, 0), icon: PackageX, sub: `${purchases.length} purchase request${purchases.length === 1 ? "" : "s"}` },
  ];

  return (
    <>
      <PageHeader eyebrow={today} title="Good evening, Chef.">
        <Button asChild size="lg"><Link to="/approvals">Review {analysis.proposals.length} proposals <ArrowRight /></Link></Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{s.label}<s.icon className="h-4 w-4" /></div>
            <div className="mt-2 font-display text-4xl font-semibold">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-xl font-semibold">Today's service</h2>
          <div className="space-y-3">
            {MEALS.map((meal) => {
              const main = dishById(state.plan[meal]);
              const served = analysis.served[meal];
              const alt = Object.entries(state.overrides[meal]).length;
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

          <h2 className="mb-3 mt-8 text-xl font-semibold">Your agent team</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(AGENTS) as (keyof typeof AGENTS)[]).map((id) => (
              <div key={id} className={`rounded-xl border-t-4 bg-card p-4 shadow-soft ${AGENTS[id].border}`}>
                <AgentAvatar agent={id} />
                <div className="mt-3 font-semibold">{AGENTS[id].name}</div>
                <div className="text-xs text-muted-foreground">{AGENTS[id].role}</div>
              </div>
            ))}
          </div>

          {state.history.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-xl font-semibold">Staff decisions</h2>
              <ul className="divide-y rounded-xl border bg-card shadow-soft">
                {state.history.slice(0, 5).map((h) => (
                  <li key={h.proposalId + h.at} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className={`h-2 w-2 rounded-full ${h.status === "approved" ? "bg-success" : "bg-destructive"}`} />
                    <span className="flex-1">{h.summary}</span>
                    <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
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
    </>
  );
}

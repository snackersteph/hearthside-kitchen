import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar, AgentChip, MEAL_LABEL } from "@/components/kitchen/agents";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Agent Dashboard · NutriSync" },
      { name: "description", content: "Live agent channel showing how the dietary, menu and inventory agents share context." },
      { property: "og:title", content: "Agent Dashboard · NutriSync" },
      { property: "og:description", content: "Live agent channel showing how the dietary, menu and inventory agents share context." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { state, analysis } = useKitchen();
  const needsStaff = analysis.conflicts.filter((c) => c.status === "needs-staff");
  return (
    <>
      <PageHeader eyebrow="Agents" title="Dashboard" />
      <section className="max-w-3xl">
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
    </>
  );
}

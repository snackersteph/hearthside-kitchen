import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar } from "@/components/kitchen/agents";
import { AgentActionHistory } from "@/components/kitchen/agent-action-history";
import type { AgentId } from "@/lib/kitchen/types";

const INFO: Record<AgentId, { summary: string; duties: string[]; link: { to: "/residents" | "/menu" | "/inventory"; label: string } }> = {
  dietary: {
    summary: "Checks every resident against every meal so nobody is served food that conflicts with their allergies, diet or texture needs.",
    duties: ["Compares each day's dishes with resident allergens and diet types", "Flags conflicts and hands them to the Menu Agent for a safe alternative", "Escalates to staff when no safe dish exists", "Re-checks automatically whenever a profile changes"],
    link: { to: "/residents", label: "View residents" },
  },
  menu: {
    summary: "Plans breakfast, lunch and dinner and proposes safe alternative dishes for residents who can't eat the main meal.",
    duties: ["Builds the daily menu from the meal rotation and staff edits", "Proposes alternatives for residents flagged by the Dietary Agent", "Sends meals to the Approval Center for staff sign-off", "Shares planned servings with the Inventory Agent"],
    link: { to: "/menu", label: "Open daily menu" },
  },
  inventory: {
    summary: "Forecasts ingredient use from the planned menus and prepares purchase requests before stock runs short.",
    duties: ["Totals ingredient demand across upcoming meals", "Counts stock on hand and incoming orders", "Prepares purchase requests grouped by vendor", "Adds delivered orders to stock once staff confirm them"],
    link: { to: "/inventory", label: "Open inventory" },
  },
};

export const Route = createFileRoute("/agents/$agentId")({
  beforeLoad: ({ params }) => { if (!(params.agentId in AGENTS)) throw notFound(); },
  head: ({ params }) => {
    const name = AGENTS[params.agentId as AgentId]?.name ?? "Agent";
    return { meta: [
      { title: `${name} · NutriSync` },
      { name: "description", content: `What the ${name} does and how it is configured.` },
      { property: "og:title", content: `${name} · NutriSync` },
      { property: "og:description", content: `What the ${name} does and how it is configured.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  component: AgentPage,
});

function AgentPage() {
  const id = Route.useParams().agentId as AgentId;
  const { state, analysis } = useKitchen();
  const agent = AGENTS[id];
  const info = INFO[id];
  const mealPending = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const open = id === "dietary" ? analysis.conflicts.length : id === "menu" ? analysis.proposals.filter((p) => p.kind === "substitution").length + mealPending : analysis.proposals.filter((p) => p.kind === "purchase").length;
  const config: [string, string][] = id === "dietary"
    ? [["Residents monitored", String(state.residents.length)], ["Checks", "Allergens, diet type, texture"], ["When no safe dish exists", "Escalate to staff"], ["Runs", "On every menu or profile change"]]
    : id === "menu"
    ? [["Meals planned per day", "3 (breakfast, lunch, dinner)"], ["Approval deadline", "Day before service"], ["Alternatives require", "Staff approval"], ["Dishes available", String(state.recipes?.length ? "Rotation + recipe edits" : "Meal rotation")]]
    : [["Forecast window", `${state.purchaseHorizonDays ?? 7} days`], ["Delivery lead time", `${Math.max(1, state.leadTimeDays ?? 2)} days`], ["Ingredients tracked", String(state.ingredients.length)], ["Purchases require", "Staff approval"]];
  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <AgentAvatar agent={id} />
        <div className="[&>div]:mb-0"><PageHeader eyebrow={agent.role} title={agent.name} /></div>
      </div>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-2 text-xl font-semibold">What it does</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{info.summary}</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm">{info.duties.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="mt-4 text-sm"><span className="font-semibold">Status:</span> {open ? `${open} open item${open > 1 ? "s" : ""}` : "Idle · all clear"}</p>
          <Link to={info.link.to} className="mt-4 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">{info.link.label} →</Link>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-xl font-semibold">Configuration</h2>
          <dl className="divide-y text-sm">{config.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
        </section>
      </div>
      <AgentActionHistory key={id} agent={id} />
    </>
  );
}

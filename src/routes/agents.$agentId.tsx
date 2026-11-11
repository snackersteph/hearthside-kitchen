import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AGENTS, AgentAvatar } from "@/components/kitchen/agents";
import { AgentActionHistory } from "@/components/kitchen/agent-action-history";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const { state, analysis, dispatch } = useKitchen();
  const router = useRouter();
  const agent = AGENTS[id];
  const info = INFO[id];
  const edit = state.agentEdits?.[id];
  const summary = edit?.summary ?? info.summary;
  const duties = edit?.duties?.length ? edit.duties : info.duties;
  const mealPending = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const open = id === "dietary" ? analysis.conflicts.length : id === "menu" ? analysis.proposals.filter((p) => p.kind === "substitution").length + mealPending : analysis.proposals.filter((p) => p.kind === "purchase").length;
  const baseConfig: [string, string][] = id === "dietary"
    ? [["Residents monitored", String(state.residents.length)], ["Checks", "Allergens, diet type, texture"], ["When no safe dish exists", "Escalate to staff"], ["Runs", "On every menu or profile change"]]
    : id === "menu"
    ? [["Meals planned per day", "3 (breakfast, lunch, dinner)"], ["Approval deadline", "Day before service"], ["Alternatives require", "Staff approval"], ["Dishes available", String(state.recipes?.length ? "Rotation + recipe edits" : "Meal rotation")]]
    : [["Forecast window", `${state.purchaseHorizonDays ?? 7} days`], ["Delivery lead time", `${Math.max(1, state.leadTimeDays ?? 2)} days`], ["Ingredients tracked", String(state.ingredients.length)], ["Purchases require", "Staff approval"]];
  const config = baseConfig.map(([k, v]) => [k, edit?.config?.[k] ?? v] as [string, string]);
  const [editing, setEditing] = useState<"about" | "config" | null>(null);
  const goBack = () => {
    const index = (window.history.state as Record<string, unknown> | null)?.["__TSR_index"];
    if (typeof index === "number" && index > 0) window.history.back();
    else void router.navigate({ to: "/dashboard" });
  };
  return (
    <>
      <Button variant="ghost" size="sm" className="mb-5" onClick={goBack}><ArrowLeft />Back</Button>
      <div className="mb-6 flex items-center gap-4">
        <AgentAvatar agent={id} />
        <div className="[&>div]:mb-0"><PageHeader eyebrow={agent.role} title={agent.name} /></div>
      </div>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">What it does</h2>
            <Button variant="outline" size="sm" onClick={() => setEditing("about")}><Pencil className="h-3.5 w-3.5" />Edit</Button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm">{duties.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="mt-4 text-sm"><span className="font-semibold">Status:</span> {open ? `${open} open item${open > 1 ? "s" : ""}` : "Idle · all clear"}</p>
          <Link to={info.link.to} className="mt-4 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">{info.link.label} →</Link>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Configuration</h2>
            <Button variant="outline" size="sm" onClick={() => setEditing("config")}><Pencil className="h-3.5 w-3.5" />Edit</Button>
          </div>
          <dl className="divide-y text-sm">{config.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
        </section>
      </div>
      <AgentActionHistory key={id} agent={id} />
      {editing === "about" && <AboutDialog summary={summary} duties={duties} onClose={() => setEditing(null)} onSave={(summary, duties) => { dispatch({ type: "editAgentProfile", agent: id, summary, duties }); setEditing(null); }} />}
      {editing === "config" && <ConfigDialog rows={config} onClose={() => setEditing(null)} onSave={(values) => { dispatch({ type: "editAgentProfile", agent: id, config: values }); setEditing(null); }} />}
    </>
  );
}

function AboutDialog({ summary, duties, onClose, onSave }: { summary: string; duties: string[]; onClose: () => void; onSave: (summary: string, duties: string[]) => void }) {
  const [text, setText] = useState(summary);
  const [list, setList] = useState(duties.join("\n"));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Edit what it does</DialogTitle></DialogHeader>
      <Label htmlFor="agent-summary">Summary</Label>
      <Textarea id="agent-summary" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <Label htmlFor="agent-duties" className="mt-2">Duties (one per line)</Label>
      <Textarea id="agent-duties" value={list} onChange={(e) => setList(e.target.value)} rows={6} />
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!text.trim()} onClick={() => onSave(text.trim(), list.split("\n").map((d) => d.trim()).filter(Boolean))}>Save</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ConfigDialog({ rows, onClose, onSave }: { rows: [string, string][]; onClose: () => void; onSave: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rows));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Edit configuration</DialogTitle></DialogHeader>
      <div className="grid gap-3">{rows.map(([k]) => <Label key={k} className="grid gap-1.5 text-sm">{k}<Input value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} /></Label>)}</div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(values)}>Save</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

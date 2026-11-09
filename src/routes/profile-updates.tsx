import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, CircleCheck } from "lucide-react";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/profile-updates")({
  head: () => ({ meta: [
    { title: "Resident profile changes · NutriSync" },
    { name: "description", content: "Review previous and updated resident profile content and acknowledge each change." },
    { property: "og:title", content: "Resident profile changes · NutriSync" },
    { property: "og:description", content: "Review and acknowledge resident care information changes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProfileUpdates,
});

function ProfileUpdates() {
  const { state, dispatch } = useKitchen();
  const [view, setView] = useState<"open" | "seen">("open");
  const updates = (state.profileUpdates ?? []).filter((u) => u.review === view).sort((a, b) => b.at - a.at);
  return <>
    <Button asChild variant="ghost" className="mb-5"><Link to="/"><ArrowLeft />Command Center</Link></Button>
    <PageHeader eyebrow="Resident care" title="Profile updates" />
    <div className="mb-6 flex gap-2 border-b pb-4">
      <Button variant={view === "open" ? "default" : "outline"} onClick={() => setView("open")}>Needs acknowledgment ({(state.profileUpdates ?? []).filter((u) => u.review === "open").length})</Button>
      <Button variant={view === "seen" ? "default" : "outline"} onClick={() => setView("seen")}>Acknowledged</Button>
    </div>
    {!updates.length && <div className="flex items-center gap-3 py-10 text-muted-foreground"><CircleCheck className="text-success" />{view === "open" ? "All profile updates acknowledged" : "No acknowledged updates yet"}</div>}
    <div className="space-y-5">{updates.map((u) => <article key={u.id} className="rounded-lg border bg-card p-5 shadow-soft">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{state.residents.some((r) => r.id === u.residentId) ? <Link to="/residents/$residentId" params={{ residentId: u.residentId }} className="text-primary hover:underline">{residentName(state, u.residentId)}</Link> : u.residentName ?? u.residentId}</h2><p className="text-sm text-muted-foreground">{new Date(u.at).toLocaleString()} · {u.summary}</p></div>
        {u.review === "open" ? <Button onClick={() => dispatch({ type: "acknowledgeProfileUpdate", id: u.id })}><Check />Acknowledge update</Button> : <span className="text-sm text-success">Acknowledged{u.acknowledgedAt ? ` · ${new Date(u.acknowledgedAt).toLocaleString()}` : ""}</span>}
      </header>
      {u.changes?.length ? <div className="divide-y">{u.changes.map((c) => <div key={c.field} className="py-4 first:pt-0">
        <h3 className="mb-2 text-sm font-semibold">{c.field}</h3>
        <div className="grid gap-4 sm:grid-cols-2">{([{ label: "Previous content", value: c.before }, { label: "Updated content", value: c.after }]).map((entry) => <div key={entry.label} className="min-w-0 border-l-2 pl-3">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{entry.label}</div>
          {c.kind === "photo" && entry.value ? <img src={entry.value} alt={entry.label} className="h-24 w-24 rounded-lg object-cover" /> : <p className="whitespace-pre-wrap break-words text-sm">{entry.value || "Not specified"}</p>}
        </div>)}</div>
      </div>)}</div> : <p className="text-sm text-muted-foreground">Previous and updated content was not recorded for this older update.</p>}
    </article>)}</div>
  </>;
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, X } from "lucide-react";
import { useKitchen, residentName } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Button } from "@/components/ui/button";
import { draftProfileChanges } from "@/lib/kitchen/profile-changes";

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
  const updates = (state.profileUpdates ?? []).filter((u) => u.review === view).sort((a, b) => b.at - a.at).map((u) => ({
    ...u,
    isDraft: !u.changes?.length,
    changes: u.changes?.length ? u.changes : draftProfileChanges(u.residentId),
  }));
  return <>
    <Button asChild variant="ghost" className="mb-5"><Link to="/"><ArrowLeft />Kitchen Pulse</Link></Button>
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
      <div className="divide-y">{u.changes.map((c) => <div key={c.field} className="py-4 first:pt-0">
        <h3 className="mb-2 text-sm font-semibold">{c.field}</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
          <div className="min-w-0 rounded-lg bg-danger-soft p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive"><X className="h-3.5 w-3.5" />Previous</div>
            {c.kind === "photo" && c.before ? <img src={c.before} alt="Previous" className="h-24 w-24 rounded-lg object-cover opacity-60" /> : <p className="whitespace-pre-wrap break-words text-sm"><del className="text-muted-foreground decoration-destructive/60 decoration-2">{c.before || "Not specified"}</del></p>}
          </div>
          <div className="hidden items-center text-muted-foreground sm:flex"><ArrowRight className="h-4 w-4" /></div>
          <div className="min-w-0 rounded-lg bg-success-soft p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" />Updated</div>
            {c.kind === "photo" && c.after ? <img src={c.after} alt="Updated" className="h-24 w-24 rounded-lg object-cover ring-2 ring-success" /> : <p className="whitespace-pre-wrap break-words text-sm"><mark className="rounded-sm bg-warning-soft px-0.5">{c.after || "Not specified"}</mark></p>}
          </div>
        </div>
      </div>)}</div>
    </article>)}</div>
  </>;
}
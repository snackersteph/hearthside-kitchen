import { useMemo, useState } from "react";
import { Check, History as HistoryIcon, Pencil, Plus, Search } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { observationStatusLabel, observationVersions, residentObservations, searchObservations } from "@/lib/kitchen/observations";
import type { Observation } from "@/lib/kitchen/types";
import { MEAL_LABEL } from "./agents";
import { ObservationDialog } from "./observation-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Per-resident observation log with shared create, edit, history and search controls. */
export function ResidentObservationLog({ residentId, observationId = null }: { residentId: string; observationId?: string | null }) {
  const { state, dispatch } = useKitchen();
  const [query, setQuery] = useState("");
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Observation | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const allEntries = useMemo(() => residentObservations(state.observations ?? [], residentId, observationId), [state.observations, residentId, observationId]);
  const entries = useMemo(() => searchObservations(allEntries, query), [allEntries, query]);
  const historyEntry = allEntries.find((observation) => observation.id === historyId) ?? null;

  return <section aria-label="Observation log">
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-md">
        <Label htmlFor="observation-search" className="sr-only">Search observations</Label>
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input id="observation-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search date, meal, dish, reaction or status" className="pl-9" />
      </div>
      {!observationId && <Button onClick={() => setLogging(true)}><Plus />Log observation</Button>}
    </div>
    <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
      {query.trim() ? `${entries.length} of ${allEntries.length} observations` : `${allEntries.length} ${allEntries.length === 1 ? "observation" : "observations"}`}
    </p>

    {!allEntries.length ? <div className="border-y py-8 text-sm text-muted-foreground">
      <p>{observationId ? "Observation not found for this resident." : "No meal reactions observed yet."}</p>
      {!observationId && <Button variant="link" className="h-auto px-0" onClick={() => setLogging(true)}>Log the first observation</Button>}
    </div> : !entries.length ? <div className="border-y py-8 text-sm text-muted-foreground">
      <p>No observations match “{query.trim()}”.</p>
      <Button variant="link" className="h-auto px-0" onClick={() => setQuery("")}>Clear search</Button>
    </div> : <div className="overflow-x-auto border-y"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{["Date", "Meal", "Dish", "Reaction", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y">{entries.map((observation) => <tr key={observation.id}>
      <td className="whitespace-nowrap px-4 py-4">{formatDate(observation.serviceDate)}</td>
      <td className="px-4 py-4">{MEAL_LABEL[observation.meal]}</td>
      <td className="min-w-40 px-4 py-4 font-medium">{dishById(observation.dishId).name}</td>
      <td className="min-w-52 px-4 py-4">{observation.reaction}</td>
      <td className="whitespace-nowrap px-4 py-4">{observation.severity === "concern" && observation.status === "open" ? <div className="flex flex-col items-start gap-2"><span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-destructive">Needs attention</span><Button size="sm" variant="outline" onClick={() => dispatch({ type: "reviewObservation", id: observation.id })}><Check />Mark reviewed</Button></div> : <span className="text-xs text-muted-foreground">{observationStatusLabel(observation)}</span>}</td>
      <td className="whitespace-nowrap px-4 py-4"><div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(observation)} aria-label={`Edit observation from ${formatDate(observation.serviceDate)}`}><Pencil />Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => setHistoryId(observation.id)} aria-label={`View history for observation from ${formatDate(observation.serviceDate)}`}><HistoryIcon />History</Button>
      </div></td>
    </tr>)}</tbody></table></div>}

    {logging && <ObservationDialog residentId={residentId} onClose={() => setLogging(false)} />}
    {editing && <ObservationDialog observation={editing} onClose={() => setEditing(null)} />}
    {historyEntry && <ObservationHistory observation={historyEntry} onClose={() => setHistoryId(null)} />}
  </section>;
}

function ObservationHistory({ observation, onClose }: { observation: Observation; onClose: () => void }) {
  const versions = observationVersions(observation);
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Observation history</DialogTitle>
        <DialogDescription>Logged {formatTime(observation.notedAt)}. Every edited or reviewed version is retained.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {versions.map((version, index) => <article key={`${version.savedAt}-${index}`} className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{index === 0 ? `Current · Version ${versions.length}` : `Previous · Version ${versions.length - index}`}</h3>
            <span className="text-xs text-muted-foreground">Saved {formatTime(version.savedAt)}</span>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-muted-foreground">Service date</dt><dd>{formatDate(version.serviceDate)}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">Meal</dt><dd>{MEAL_LABEL[version.meal]}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">Dish</dt><dd>{dishById(version.dishId).name}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">Status</dt><dd>{observationStatusLabel(version)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-medium text-muted-foreground">What happened</dt><dd className="mt-1 whitespace-pre-wrap">{version.reaction}</dd></div>
          </dl>
        </article>)}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

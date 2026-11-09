import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { conflictReasons } from "@/lib/kitchen/engine";
import { ALLERGENS, DIETS, MEALS, type Resident } from "@/lib/kitchen/types";
import { PageHeader } from "@/components/kitchen/app-shell";
import { MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/residents")({
  head: () => ({
    meta: [
      { title: "Residents · Hearth Kitchen Command" },
      { name: "description", content: "Dietary profiles, allergies and texture needs for every resident." },
      { property: "og:title", content: "Residents · Hearth Kitchen Command" },
      { property: "og:description", content: "Dietary profiles, allergies and texture needs for every resident." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResidentsPage,
});

function ResidentsPage() {
  const { state, analysis } = useKitchen();
  const [editing, setEditing] = useState<Resident | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const list = state.residents.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.room.includes(q)).sort(compareByFirstName);

  return (
    <>
      <PageHeader eyebrow={`${state.residents.length} residents`} title="Dietary Profiles">
        <div className="flex flex-wrap gap-2"><Input placeholder="Search name or room" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 bg-card" /><Button onClick={() => setAdding(true)}><Plus />Add New</Button></div>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <button key={r.id} onClick={() => setEditing(r)} className="rounded-xl border bg-card p-5 text-left shadow-soft transition hover:border-primary">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">Room {r.room} · Age {r.age}</div>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-display text-sm font-semibold text-secondary-foreground">{r.name.split(" ").map((n) => n[0]).join("")}</span>
            </div>
            <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
              {r.allergens.map((a) => <Tag key={a} tone="danger">No {a}</Tag>)}
              {r.diets.map((d) => <Tag key={d} tone="warn">{d}</Tag>)}
              {!r.allergens.length && !r.diets.length && <Tag tone="ok">No restrictions</Tag>}
            </div>
            <div className="mt-4 space-y-1 border-t pt-3">
              {MEALS.map((m) => {
                const dish = dishById(analysis.served[m][r.id] ?? state.plan[m]);
                const unsafe = conflictReasons(r, dish).length > 0;
                const c = analysis.conflicts.find((x) => x.meal === m && x.residentId === r.id);
                return (
                  <div key={m} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-muted-foreground">{MEAL_LABEL[m]}</span>
                    <span className={cn("flex-1 truncate", unsafe && "text-destructive")}>{dish.name}</span>
                    {c?.status === "proposal-pending" && <Tag tone="warn">pending</Tag>}
                    {unsafe && <Tag tone="danger">conflict</Tag>}
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>
      {editing && <EditDialog resident={editing} onClose={() => setEditing(null)} />}
      {adding && <EditDialog resident={{ id: "", name: "", room: "", age: 80, allergens: [], diets: [], likes: [], notes: "" }} isNew onClose={() => setAdding(false)} />}
    </>
  );
}

export function compareByFirstName(a: Resident, b: Resident) {
  const first = (r: Resident) => r.name.trim().split(/\s+/)[0] ?? "";
  return first(a).localeCompare(first(b), undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function EditDialog({ resident, isNew = false, onClose }: { resident: Resident; isNew?: boolean; onClose: () => void }) {
  const { dispatch } = useKitchen();
  const [r, setR] = useState(resident);
  const toggle = <K extends "allergens" | "diets">(k: K, v: Resident[K][number]) =>
    setR((p) => ({ ...p, [k]: (p[k] as string[]).includes(v) ? (p[k] as string[]).filter((x) => x !== v) : [...p[k], v] }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{isNew ? "Add resident" : r.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); dispatch(isNew ? { type: "addResident", resident: { ...r, id: crypto.randomUUID() } } : { type: "updateResident", resident: r }); toast.success(isNew ? "Resident added" : "Profile saved — meals rechecked"); onClose(); }} className="space-y-4">
          {isNew && <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-sm font-medium">Name<Input required aria-label="Resident name" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
            <label className="text-sm font-medium">Room<Input required aria-label="Room" value={r.room} onChange={(e) => setR({ ...r, room: e.target.value })} /></label>
            <label className="text-sm font-medium">Age<Input required aria-label="Age" type="number" min={1} max={120} value={r.age} onChange={(e) => setR({ ...r, age: Number(e.target.value) })} /></label>
          </div>}
          {!isNew && r.careProfile && <div className="grid gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Room</span> {r.room} · <span className="text-muted-foreground">Age</span> {r.age}</div>
            {Object.entries(r.careProfile).map(([label, value]) => <div key={label}><span className="text-muted-foreground">{label}:</span> {value}</div>)}
          </div>}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allergies & intolerances</div>
            <div className="flex flex-wrap gap-2">{ALLERGENS.map((a) => <Chip key={a} on={r.allergens.includes(a)} onClick={() => toggle("allergens", a)}>{a}</Chip>)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diet & texture</div>
            <div className="flex flex-wrap gap-2">{DIETS.map((d) => <Chip key={d} on={r.diets.includes(d)} onClick={() => toggle("diets", d)}>{d}</Chip>)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Likes</div>
            <Input value={r.likes.join(", ")} onChange={(e) => setR({ ...r, likes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clinical notes</div>
            <Textarea value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} />
          </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isNew && (!r.name.trim() || !r.room.trim())}>{isNew ? "Add resident" : "Save profile"}</Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={on ? "default" : "outline"} size="sm" aria-pressed={on} onClick={onClick} className="capitalize">{children}</Button>;
}

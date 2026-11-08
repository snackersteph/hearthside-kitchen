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

export const Route = createFileRoute("/residents")({
  head: () => ({
    meta: [
      { title: "Residents · Hearth Kitchen Command" },
      { name: "description", content: "Dietary profiles, allergies and texture needs for every resident." },
      { property: "og:title", content: "Residents · Hearth Kitchen Command" },
      { property: "og:description", content: "Dietary profiles, allergies and texture needs for every resident." },
    ],
  }),
  component: ResidentsPage,
});

function ResidentsPage() {
  const { state, analysis } = useKitchen();
  const [editing, setEditing] = useState<Resident | null>(null);
  const [q, setQ] = useState("");
  const list = state.residents.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.room.includes(q));

  return (
    <>
      <PageHeader eyebrow={`${state.residents.length} residents`} title="Dietary Profiles">
        <Input placeholder="Search name or room" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 bg-card" />
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
                const dish = dishById(analysis.served[m][r.id]);
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
    </>
  );
}

function EditDialog({ resident, onClose }: { resident: Resident; onClose: () => void }) {
  const { dispatch } = useKitchen();
  const [r, setR] = useState(resident);
  const toggle = <K extends "allergens" | "diets">(k: K, v: Resident[K][number]) =>
    setR((p) => ({ ...p, [k]: (p[k] as string[]).includes(v) ? (p[k] as string[]).filter((x) => x !== v) : [...p[k], v] }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-2xl">{r.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { dispatch({ type: "updateResident", resident: r }); toast.success("Profile saved — Dietary Agent re-checking meals"); onClose(); }}>Save profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-full border px-3 py-1 text-sm capitalize transition", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>{children}</button>;
}

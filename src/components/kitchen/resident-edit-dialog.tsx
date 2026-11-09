import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { ALLERGENS, DIETS, type Resident } from "@/lib/kitchen/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function EditDialog({ resident, isNew = false, onClose }: { resident: Resident; isNew?: boolean; onClose: () => void }) {
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

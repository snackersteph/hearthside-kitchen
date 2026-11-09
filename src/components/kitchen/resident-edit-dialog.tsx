import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { ALLERGENS, DIETS, type Resident } from "@/lib/kitchen/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ResidentPhoto } from "@/components/kitchen/resident-photo";
import { readResidentImage } from "@/lib/kitchen/resident-image";

export type ProfileSection = "Basic information" | "Health & dietary requirements" | "Food preferences" | "Special meal instructions" | "Clinical notes";

const CARE_FIELDS: Record<ProfileSection, string[]> = {
  "Basic information": ["Gender", "Mobility", "Eating Assistance"],
  "Health & dietary requirements": ["Medical Conditions", "Texture Requirement", "Swallowing Difficulties", "Liquid Consistency", "Nutritional Priority"],
  "Food preferences": ["Disliked Foods", "Preferred Cuisine", "Preferred Beverages", "Portion Preference"],
  "Special meal instructions": [],
  "Clinical notes": [],
};

export function EditDialog({ resident, isNew = false, section, onClose }: { resident: Resident; isNew?: boolean; section?: ProfileSection; onClose: () => void }) {
  const { dispatch } = useKitchen();
  const [r, setR] = useState(resident);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const show = (name: ProfileSection) => !section || section === name;
  const toggle = <K extends "allergens" | "diets">(k: K, v: Resident[K][number]) =>
    setR((p) => {
      const values = (p[k] as string[]).includes(v) ? (p[k] as string[]).filter((x) => x !== v) : [...p[k], v];
      return { ...p, [k]: values, ...(section ? { careProfile: { ...p.careProfile, [k === "allergens" ? "Food Allergies" : "Diet Type"]: values.join(", ") || (k === "allergens" ? "None known" : "Regular") } } : {}) };
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{isNew ? "Add resident" : section ? `Edit ${section.toLowerCase()}` : r.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); dispatch(isNew ? { type: "addResident", resident: { ...r, id: crypto.randomUUID() } } : { type: "updateResident", resident: r }); toast.success(isNew ? "Resident added" : "Profile saved — meals rechecked"); onClose(); }} className="space-y-4">
          {(isNew || section === "Basic information") && <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center gap-4">
              <ResidentPhoto resident={r} />
              <div className="min-w-0 flex-1">
                <label className="text-sm font-medium">Profile photo<Input type="file" aria-label="Profile photo" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPhotoError("");
                  setUploading(true);
                  try {
                    const photoUrl = await readResidentImage(file);
                    setR((previous) => ({ ...previous, photoUrl }));
                  } catch (error) {
                    setPhotoError(error instanceof Error ? error.message : "Unable to upload photo.");
                  } finally { setUploading(false); }
                }} /></label>
                {uploading && <p role="status" className="mt-1 text-sm text-muted-foreground">Preparing photo…</p>}
                {photoError && <p role="alert" className="mt-1 text-sm text-destructive">{photoError}</p>}
                {r.photoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setR((previous) => ({ ...previous, photoUrl: undefined }))}>Remove photo</Button>}
              </div>
            </div>
            <label className="col-span-2 text-sm font-medium">Name<Input required aria-label="Resident name" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
            <label className="text-sm font-medium">Room<Input required aria-label="Room" value={r.room} onChange={(e) => setR({ ...r, room: e.target.value })} /></label>
            <label className="text-sm font-medium">Age<Input required aria-label="Age" type="number" min={1} max={120} value={r.age} onChange={(e) => setR({ ...r, age: Number(e.target.value) })} /></label>
          </div>}
          {!isNew && !section && r.careProfile && <div className="grid gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Room</span> {r.room} · <span className="text-muted-foreground">Age</span> {r.age}</div>
            {Object.entries(r.careProfile).map(([label, value]) => <div key={label}><span className="text-muted-foreground">{label}:</span> {value}</div>)}
          </div>}
          {section && CARE_FIELDS[section].map((field) => <label key={field} className="block text-sm font-medium">{field}<Input aria-label={field} value={r.careProfile?.[field] ?? ""} onChange={(e) => setR((previous) => ({ ...previous, careProfile: { ...previous.careProfile, [field]: e.target.value } }))} /></label>)}
          {show("Health & dietary requirements") && <><div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allergies & intolerances</div>
            <div className="flex flex-wrap gap-2">{ALLERGENS.map((a) => <Chip key={a} on={r.allergens.includes(a)} onClick={() => toggle("allergens", a)}>{a}</Chip>)}</div>
          </div></>}
          {show("Food preferences") && <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diet & texture</div>
            <div className="flex flex-wrap gap-2">{DIETS.map((d) => <Chip key={d} on={r.diets.includes(d)} onClick={() => toggle("diets", d)}>{d}</Chip>)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Likes</div>
            <Input aria-label="Favorite foods" value={r.likes.join(", ")} onChange={(e) => setR({ ...r, likes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>}
          {section === "Special meal instructions" && <label className="block text-sm font-medium">Special meal instructions<Textarea aria-label="Special meal instructions" value={r.mealInstructions?.join("\n") ?? ""} onChange={(e) => setR({ ...r, mealInstructions: e.target.value.split("\n") })} /></label>}
          {show("Clinical notes") && <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clinical notes</div>
            <Textarea aria-label="Clinical notes" value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} />
          </div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={uploading || !r.name.trim() || !r.room.trim()}>{isNew ? "Add resident" : section ? "Save changes" : "Save profile"}</Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={on ? "default" : "outline"} size="sm" aria-pressed={on} onClick={onClick} className="capitalize">{children}</Button>;
}

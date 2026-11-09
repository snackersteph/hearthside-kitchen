import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { medicalConditions } from "@/lib/kitchen/resident-profile";
import { PageHeader } from "@/components/kitchen/app-shell";
import { EditDialog, type ProfileSection } from "@/components/kitchen/resident-edit-dialog";
import { Button } from "@/components/ui/button";
import { ResidentPhoto } from "@/components/kitchen/resident-photo";
import { ResidentMealHistory } from "@/components/kitchen/resident-meal-history";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/residents_/$residentId")({
  head: ({ params }) => ({ meta: [
    { title: `Resident ${params.residentId} · NutriSync` },
    { name: "description", content: `Complete dietary and care profile for resident ${params.residentId}.` },
    { property: "og:title", content: `Resident ${params.residentId} · NutriSync` },
    { property: "og:description", content: `Complete dietary and care profile for resident ${params.residentId}.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { approval?: string } => typeof search["approval"] === "string" ? { approval: search["approval"] } : {},
  component: ResidentProfilePage,
});

function ResidentProfilePage() {
  const { residentId } = Route.useParams();
  const { state, dispatch } = useKitchen();
  const navigate = Route.useNavigate();
  const [editing, setEditing] = useState<ProfileSection | null>(null);
  const r = state.residents.find((resident) => resident.id === residentId);
  const { approval } = Route.useSearch();
  const back = approval
    ? <Button asChild variant="ghost" className="mb-6"><Link to="/approvals" hash={`proposal-${approval}`}><ArrowLeft />Back to approval card</Link></Button>
    : <Button asChild variant="ghost" className="mb-6"><Link to="/residents"><ArrowLeft />All residents</Link></Button>;
  if (!r) return <>{back}<PageHeader eyebrow="Residents" title="Resident not found" /></>;
  const profile = r.careProfile ?? {};
  const priority = profile["Nutritional Priority"] ?? r.notes.split("\n").find((line) => line.startsWith("Nutritional priority:"))?.slice("Nutritional priority:".length).trim() ?? "Not specified";
  const sections: { title: ProfileSection; entries: string[][] }[] = [
    { title: "Basic information", entries: [["Resident ID", r.id], ["Age", String(r.age)], ["Gender", profile["Gender"] ?? "Not specified"], ["Room number", r.room], ["Mobility", profile["Mobility"] ?? "Not specified"], ["Eating assistance", profile["Eating Assistance"] ?? "Not specified"]] },
    { title: "Health & dietary requirements", entries: [["Medical conditions", medicalConditions(r)], ["Diet type", profile["Diet Type"] ?? (r.diets.join(", ") || "Regular")], ["Food allergies", profile["Food Allergies"] ?? (r.allergens.join(", ") || "None known")], ["Texture requirement", profile["Texture Requirement"] ?? "Not specified"], ["Swallowing difficulties", profile["Swallowing Difficulties"] ?? "Not specified"], ...(profile["Liquid Consistency"] ? [["Liquid consistency", profile["Liquid Consistency"]]] : []), ["Nutritional priority", priority]] },
    { title: "Food preferences", entries: [["Favorite foods", r.likes.join(", ") || "Not specified"], ["Disliked foods", profile["Disliked Foods"] ?? "Not specified"], ["Preferred cuisine", profile["Preferred Cuisine"] ?? "Not specified"], ["Preferred beverages", profile["Preferred Beverages"] ?? "Not specified"], ["Portion preference", profile["Portion Preference"] ?? "Not specified"]] },
  ];
  return <>
    {back}
    <div className="mb-8 flex flex-wrap items-center gap-6">
      <ResidentPhoto resident={r} large />
      <div className="min-w-0 flex-1 [&>div]:mb-0"><PageHeader eyebrow={`Resident ${r.id} · Room ${r.room}`} title={r.name}>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 />Delete resident</Button></AlertDialogTrigger>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
            <AlertDialogHeader><AlertDialogTitle>Delete {r.name}?</AlertDialogTitle><AlertDialogDescription>This will permanently remove their profile, photo, and saved meal choices. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" onClick={() => { dispatch({ type: "deleteResident", id: r.id }); void navigate({ to: "/residents" }); }}><Trash2 />Delete resident</Button></AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader></div>
    </div>
    <div className="space-y-8">
      {sections.map((section) => <section key={section.title} className="border-t pt-6">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">{section.title}</h2><Button variant="outline" size="icon" aria-label={`Edit ${section.title.toLowerCase()}`} title={`Edit ${section.title.toLowerCase()}`} onClick={() => setEditing(section.title)}><Pencil /></Button></div>
        <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{section.entries.map(([label, value]) => <div key={label} className="min-w-0"><dt className="mb-1 text-sm text-muted-foreground">{label}</dt><dd className="break-words text-sm leading-relaxed">{value}</dd></div>)}</dl>
      </section>)}
      <section className="border-t pt-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Special meal instructions</h2><Button variant="outline" size="icon" aria-label="Edit special meal instructions" title="Edit special meal instructions" onClick={() => setEditing("Special meal instructions")}><Pencil /></Button></div>
        {r.mealInstructions?.length ? <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">{r.mealInstructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ul> : <p className="text-sm text-muted-foreground">Not specified</p>}
      </section>
      <section className="border-t pt-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Clinical notes</h2><Button variant="outline" size="icon" aria-label="Edit clinical notes" title="Edit clinical notes" onClick={() => setEditing("Clinical notes")}><Pencil /></Button></div><p className="whitespace-pre-line text-sm leading-relaxed">{r.notes || "Not specified"}</p></section>
      <ResidentMealHistory residentId={r.id} />
    </div>
    {editing && <EditDialog resident={r} section={editing} onClose={() => setEditing(null)} />}
  </>;
}
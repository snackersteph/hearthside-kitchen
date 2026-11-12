import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { compareByFirstName, medicalConditions } from "@/lib/kitchen/resident-profile";
import { PageHeader } from "@/components/kitchen/app-shell";
import { EditDialog } from "@/components/kitchen/resident-edit-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { ResidentPhoto } from "@/components/kitchen/resident-photo";
import { cn } from "@/lib/utils";
export { compareByFirstName } from "@/lib/kitchen/resident-profile";

export const Route = createFileRoute("/residents")({
  head: () => ({
    meta: [
      { title: "Residents · NutriSync" },
      { name: "description", content: "Dietary profiles, allergies and texture needs for every resident." },
      { property: "og:title", content: "Residents · NutriSync" },
      { property: "og:description", content: "Dietary profiles, allergies and texture needs for every resident." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResidentsPage,
});

function ResidentsPage() {
  const { state } = useKitchen();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [letter, setLetter] = useState("All");
  const list = state.residents.filter((r) =>
    (letter === "All" || r.name.trim().toUpperCase().startsWith(letter)) &&
    (r.name.toLowerCase().includes(q.toLowerCase()) || r.room.includes(q))
  ).sort(compareByFirstName);
  const openUpdates = new Set((state.profileUpdates ?? []).filter((u) => u.review === "open").map((u) => u.residentId));
  return <>
    <PageHeader eyebrow="" title="Residents">
      <div className="flex flex-wrap gap-2"><Input aria-label="Search name or room" placeholder="Search name or room" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 bg-card" /><Button onClick={() => setAdding(true)}><Plus />Add New</Button></div>
    </PageHeader>
    <nav aria-label="Filter residents by first letter" className="mb-5 flex flex-wrap items-center gap-1 border-b border-border pb-3">
      {["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((value) => <Button
        key={value}
        variant="link"
        size="sm"
        aria-pressed={letter === value}
        onClick={() => setLetter(value)}
        className={cn("h-9 min-w-8 rounded-none px-2", letter === value ? "font-bold text-primary underline decoration-2 underline-offset-8" : "font-medium text-muted-foreground no-underline")}
      >{value}</Button>)}
    </nav>
    <p className="mb-3 text-sm text-muted-foreground">{list.length === state.residents.length ? `${state.residents.length} residents` : `${list.length} of ${state.residents.length} residents`}</p>
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="min-w-[900px] xl:min-w-0 [&_th]:border-r [&_td]:border-r [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0 [&_th]:border-border [&_td]:border-border">
        <TableHeader className="bg-muted/50"><TableRow><TableHead className="w-20 min-w-20 px-3 py-4"><span className="sr-only">Photo</span></TableHead>{["Name", "Gender", "Room", "Medical conditions", "Diet type", "Food allergies"].map((h) => <TableHead key={h} className="px-3 py-4 text-base font-bold text-foreground">{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{list.map((r) => {
          const allergies = r.careProfile?.["Food Allergies"] ?? r.allergens.join(", ");
          const values = [r.name, r.careProfile?.["Gender"] ?? "Not specified", r.room, medicalConditions(r), r.careProfile?.["Diet Type"] ?? (r.diets.join(", ") || "Regular"), /^none( known)?$/i.test(allergies.trim()) ? "" : allergies];
          return <TableRow key={r.id} className="group"><TableCell className="p-0 align-middle"><Link to="/residents/$residentId" params={{ residentId: r.id }} tabIndex={-1} className="block p-3"><ResidentPhoto resident={r} /></Link></TableCell>{values.map((value, i) => <TableCell key={i} className="p-0 align-middle">{i === 0 ? <div className="flex min-h-16 items-center gap-2 px-3 py-4"><Link to="/residents/$residentId" params={{ residentId: r.id }} aria-label={`View ${r.name}`} className={cn("font-semibold group-hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring")}>{value}</Link>{openUpdates.has(r.id) && <Link to="/profile-updates" aria-label={`Review profile update for ${r.name}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning hover:underline"><span className="size-1.5 rounded-full bg-warning" />New update</Link>}</div> : <Link to="/residents/$residentId" params={{ residentId: r.id }} tabIndex={-1} className={cn("flex min-h-16 items-center px-3 py-4 group-hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring")}>{i === 5 ? value : value || "—"}</Link>}</TableCell>)}</TableRow>;
        })}{!list.length && <TableRow><TableCell colSpan={7} className="p-8 text-center text-muted-foreground">No residents found.</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
    {adding && <EditDialog resident={{ id: "", name: "", room: "", age: 80, allergens: [], diets: [], likes: [], notes: "" }} isNew onClose={() => setAdding(false)} />}
  </>;
}

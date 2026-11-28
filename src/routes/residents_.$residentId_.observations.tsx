import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, History } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { ResidentObservationLog } from "@/components/kitchen/resident-observation-log";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/residents_/$residentId_/observations")({
  head: ({ params }) => ({ meta: [
    { title: `Observation log · Resident ${params.residentId} · NutriSync` },
    { name: "description", content: `Food reaction observation log for resident ${params.residentId}.` },
    { property: "og:title", content: `Observation log · Resident ${params.residentId} · NutriSync` },
    { property: "og:description", content: `Food reaction observation log for resident ${params.residentId}.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { approval?: string; from?: "observation-board"; observation?: string } => ({
    ...(typeof search["approval"] === "string" ? { approval: search["approval"] } : {}),
    ...(search["from"] === "observation-board" ? { from: "observation-board" as const } : {}),
    ...(typeof search["observation"] === "string" && search["observation"].trim() ? { observation: search["observation"] } : {}),
  }),
  component: ResidentObservationsPage,
});

function ResidentObservationsPage() {
  const { residentId } = Route.useParams();
  const { approval, from, observation } = Route.useSearch();
  const { state } = useKitchen();
  const r = state.residents.find((resident) => resident.id === residentId);
  const back = from === "observation-board"
    ? <Button asChild variant="ghost" className="mb-6"><Link to="/" hash="observation-board"><ArrowLeft />Back to observation board</Link></Button>
    : <Button asChild variant="ghost" className="mb-6"><Link to="/residents/$residentId" params={{ residentId }} search={approval ? { approval } : {}}><ArrowLeft />Back to profile</Link></Button>;
  if (!r) return <>{back}<PageHeader eyebrow="Residents" title="Resident not found" /></>;
  return <>
    {back}
    <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <PageHeader eyebrow={`Resident ${r.id} · Room ${r.room}`} title={`${observation ? "Observation" : "Observation log"} · ${r.name}`} />
      {observation && <Button asChild variant="outline" className="w-fit shrink-0"><Link to="/residents/$residentId/observations" params={{ residentId }} search={{ ...(approval ? { approval } : {}), ...(from ? { from } : {}) }}><History />Resident history</Link></Button>}
    </div>
    <ResidentObservationLog key={observation ?? "full-log"} residentId={r.id} observationId={observation ?? null} />
  </>;
}

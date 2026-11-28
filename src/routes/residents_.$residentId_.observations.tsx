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
  validateSearch: (search: Record<string, unknown>): { approval?: string; from?: "observation-board"; observation?: string; returnObservation?: string } => ({
    ...(typeof search["approval"] === "string" ? { approval: search["approval"] } : {}),
    ...(search["from"] === "observation-board" ? { from: "observation-board" as const } : {}),
    ...(typeof search["observation"] === "string" && search["observation"].trim() ? { observation: search["observation"] } : {}),
    ...(typeof search["returnObservation"] === "string" && search["returnObservation"].trim() ? { returnObservation: search["returnObservation"] } : {}),
  }),
  component: ResidentObservationsPage,
});

function ResidentObservationsPage() {
  const { residentId } = Route.useParams();
  const { approval, from, observation, returnObservation } = Route.useSearch();
  const { state } = useKitchen();
  const r = state.residents.find((resident) => resident.id === residentId);
  const back = !observation && returnObservation
    ? <Button asChild variant="ghost" className="mb-6"><Link to="/residents/$residentId/observations" params={{ residentId }} search={{ observation: returnObservation, ...(approval ? { approval } : {}), ...(from ? { from } : {}) }}><ArrowLeft />Back to observation</Link></Button>
    : from === "observation-board"
    ? <Button asChild variant="ghost" className="mb-6"><Link to="/" hash="observation-board"><ArrowLeft />Back to observation board</Link></Button>
    : <Button asChild variant="ghost" className="mb-6"><Link to="/residents/$residentId" params={{ residentId }} search={approval ? { approval } : {}}><ArrowLeft />Back to profile</Link></Button>;
  if (!r) return <>{back}<PageHeader eyebrow="Residents" title="Resident not found" /></>;
  return <>
    {back}
    <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase text-primary">Resident {r.id} · Room {r.room}</p>
        <h1 className="text-3xl font-medium leading-tight text-foreground md:text-[38px] xl:text-[42px]">{observation ? "Observation" : "Observation log"} · {r.name}</h1>
      </div>
      {observation && <Button asChild variant="outline" className="w-fit shrink-0"><Link to="/residents/$residentId/observations" params={{ residentId }} search={{ returnObservation: observation, ...(approval ? { approval } : {}), ...(from ? { from } : {}) }}><History />Resident history</Link></Button>}
    </div>
    <ResidentObservationLog key={observation ?? "full-log"} residentId={r.id} observationId={observation ?? null} />
  </>;
}

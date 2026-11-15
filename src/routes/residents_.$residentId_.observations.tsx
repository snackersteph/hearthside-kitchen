import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
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
  validateSearch: (search: Record<string, unknown>): { approval?: string } => typeof search["approval"] === "string" ? { approval: search["approval"] } : {},
  component: ResidentObservationsPage,
});

function ResidentObservationsPage() {
  const { residentId } = Route.useParams();
  const { approval } = Route.useSearch();
  const { state } = useKitchen();
  const r = state.residents.find((resident) => resident.id === residentId);
  const back = <Button asChild variant="ghost" className="mb-6"><Link to="/residents/$residentId" params={{ residentId }} search={approval ? { approval } : {}}><ArrowLeft />Back to profile</Link></Button>;
  if (!r) return <>{back}<PageHeader eyebrow="Residents" title="Resident not found" /></>;
  return <>
    {back}
    <div className="mb-8"><PageHeader eyebrow={`Resident ${r.id} · Room ${r.room}`} title={`Observation log · ${r.name}`} /></div>
    <ResidentObservationLog residentId={r.id} />
  </>;
}

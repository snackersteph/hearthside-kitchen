import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { ResidentMealHistory } from "@/components/kitchen/resident-meal-history";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/residents_/$residentId_/meal-history")({
  head: ({ params }) => ({ meta: [
    { title: `Meal history · Resident ${params.residentId} · NutriSync` },
    { name: "description", content: `Recorded meal history for resident ${params.residentId}.` },
    { property: "og:title", content: `Meal history · Resident ${params.residentId} · NutriSync` },
    { property: "og:description", content: `Recorded meal history for resident ${params.residentId}.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { approval?: string } => typeof search["approval"] === "string" ? { approval: search["approval"] } : {},
  component: ResidentMealHistoryPage,
});

function ResidentMealHistoryPage() {
  const { residentId } = Route.useParams();
  const { approval } = Route.useSearch();
  const { state } = useKitchen();
  const r = state.residents.find((resident) => resident.id === residentId);
  const back = <Button asChild variant="ghost" className="mb-6"><Link to="/residents/$residentId" params={{ residentId }} search={approval ? { approval } : {}}><ArrowLeft />Back to profile</Link></Button>;
  if (!r) return <>{back}<PageHeader eyebrow="Residents" title="Resident not found" /></>;
  return <>
    {back}
    <div className="mb-8"><PageHeader eyebrow={`Resident ${r.id} · Room ${r.room}`} title={`Meal history · ${r.name}`} /></div>
    <ResidentMealHistory residentId={r.id} />
  </>;
}

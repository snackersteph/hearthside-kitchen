import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, CircleCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useKitchen } from "@/lib/kitchen/store";
import { emergencyMenuDemo } from "@/lib/kitchen/emergency-menu-demo";
import { isDateKey } from "@/lib/kitchen/weekly-schedule";
import { weekRange } from "@/lib/kitchen/weekly-operations";
import { addDays } from "@/lib/kitchen/weekly-schedule";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/kitchen/app-shell";

export const Route = createFileRoute("/emergency-menu")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => ({ ...(isDateKey(search["week"]) ? { week: search["week"] } : {}) }),
  head: () => ({ meta: [
    { title: "Emergency menu review · NutriSync" },
    { name: "description", content: "Review the fictional fluid-only emergency menu scenario and return to the current service week." },
    { property: "og:title", content: "Emergency menu review · NutriSync" },
    { property: "og:description", content: "Review and approve a showcase emergency menu decision." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: EmergencyMenuPage,
});

function EmergencyMenuPage() {
  const { state, reference, dispatch } = useKitchen();
  const { week } = Route.useSearch();
  const current = emergencyMenuDemo(state, reference);
  const request = current && (!week || current.week === week) ? current : null;
  const back = <Button asChild variant="outline"><Link to="/" hash="current-service-week"><ArrowLeft />Back to current service week</Link></Button>;
  return <>
    <div className="mb-5">{back}</div>
    <PageHeader title="Emergency menu review" />
    {!request ? <p className="py-8 text-muted-foreground">No emergency menu request for this service week.</p> : <section aria-label="Emergency menu request" className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive"><TriangleAlert className="size-5" />Demo emergency · {weekRange(request.week, addDays(request.week, 6))}</div>
      <div><h2 className="text-xl font-semibold">{request.resident}</h2><p className="mt-2 text-sm">{request.incident}</p><p className="mt-2 text-sm text-muted-foreground">Fictional scenario. Existing resident care records and actual menus remain unchanged.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-danger-soft p-4"><h3 className="mb-2 text-sm font-semibold text-destructive">Previous menu</h3><del className="text-sm text-muted-foreground">{request.previous}</del></div>
        <div className="rounded-lg bg-success-soft p-4"><h3 className="mb-2 text-sm font-semibold text-success">Proposed emergency menu</h3><p className="text-sm">{request.proposed}</p></div>
      </div>
      <p className="text-sm text-muted-foreground">Regular soups and purées are not assumed suitable for a fluid-only prescription. The care team must specify the permitted consistency and meal preparation.</p>
      {request.approvedAt ? <div role="status" className="space-y-4 border-t pt-5"><p className="flex items-center gap-2 font-semibold text-success"><CircleCheck />Emergency menu approved</p>{back}</div> : <Button onClick={() => { dispatch({ type: "approveEmergencyMenuDemo", id: request.id }); toast.success("Emergency menu approved"); }}><Check />Approve emergency menu</Button>}
    </section>}
  </>;
}
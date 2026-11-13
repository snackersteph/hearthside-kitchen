import { useKitchen } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { MEAL_LABEL } from "./agents";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

/** Per-resident view of the observation board: food reaction history. */
export function ResidentObservationLog({ residentId }: { residentId: string }) {
  const { state, dispatch } = useKitchen();
  const entries = (state.observations ?? []).filter((o) => o.residentId === residentId).sort((a, b) => b.notedAt - a.notedAt);
  return <section className="border-t pt-6" aria-label="Observation log">
    <h2 className="mb-5 font-display text-xl font-semibold">Observation log</h2>
    {!entries.length ? <p className="border-y py-6 text-sm text-muted-foreground">No meal reactions observed yet.</p> : <div className="overflow-x-auto border-y"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{["Date", "Meal", "Dish", "Reaction", "Status"].map((t) => <th key={t} className="px-4 py-3 font-semibold">{t}</th>)}</tr></thead><tbody className="divide-y">{entries.map((o) => <tr key={o.id}>
      <td className="whitespace-nowrap px-4 py-4">{new Date(`${o.serviceDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
      <td className="px-4 py-4">{MEAL_LABEL[o.meal]}</td>
      <td className="min-w-40 px-4 py-4 font-medium">{dishById(o.dishId).name}</td>
      <td className="min-w-52 px-4 py-4">{o.reaction}</td>
      <td className="whitespace-nowrap px-4 py-4">{o.severity === "concern" && o.status === "open" ? <div className="flex flex-col items-start gap-2"><span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-destructive">Needs attention</span><Button size="sm" variant="outline" onClick={() => dispatch({ type: "reviewObservation", id: o.id })}><Check />Mark reviewed</Button></div> : <span className="text-xs text-muted-foreground">{o.severity === "concern" ? "Reviewed" : "Note"}</span>}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}

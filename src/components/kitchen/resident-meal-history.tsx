import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { residentMealHistory } from "@/lib/kitchen/resident-meal-history";
import { dishById } from "@/lib/kitchen/data";
import { MEAL_LABEL } from "./agents";
import { Button } from "@/components/ui/button";

export function ResidentMealHistory({ residentId }: { residentId: string }) {
  const { state } = useKitchen();
  const [days, setDays] = useState(7);
  const records = residentMealHistory(state, residentId, days);
  return <section className="border-t pt-6" aria-label="Meal history"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Meal history</h2><div role="group" aria-label="Meal history period" className="flex gap-1">{[{ days: 7, label: "Past week" }, { days: 14, label: "2 weeks" }, { days: 30, label: "Month" }].map((period) => <Button key={period.days} size="sm" variant={days === period.days ? "default" : "outline"} aria-pressed={days === period.days} onClick={() => setDays(period.days)}>{period.label}</Button>)}</div></div>
    {!records.length ? <p className="border-y py-6 text-sm text-muted-foreground">No recorded meals for this period.</p> : <div className="overflow-x-auto border-y"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{["Date", "Meal", "Dish", "Record", "Reactions"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y">{records.map((record) => <tr key={`${record.date}-${record.meal}-${record.dishId}`}><td className="whitespace-nowrap px-4 py-4">{new Date(`${record.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td><td className="px-4 py-4">{MEAL_LABEL[record.meal]}</td><td className="min-w-48 px-4 py-4 font-medium">{dishById(record.dishId).name}</td><td className="px-4 py-4 text-muted-foreground">{record.source === "reported" ? "Meal reported" : "Recorded menu"}</td><td className="min-w-52 px-4 py-4">{record.reactions.join(" · ") || "—"}</td></tr>)}</tbody></table></div>}
  </section>;
}
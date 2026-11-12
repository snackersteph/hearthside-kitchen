import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { BoardReturn, boardReturnSearch } from "@/components/kitchen/board-return";
import { PageHeader } from "@/components/kitchen/app-shell";
import { MEAL_LABEL } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { useKitchen } from "@/lib/kitchen/store";
import { weeklyMenu } from "@/lib/kitchen/weekly-menu";
import { isDateKey, parseDateKey, weekStartFor } from "@/lib/kitchen/weekly-schedule";
import { weekRange } from "@/lib/kitchen/weekly-operations";
import { dateKey } from "@/lib/kitchen/schedule";
import { recipePhoto } from "@/lib/kitchen/recipe-photos";

export const Route = createFileRoute("/service-menu")({
  validateSearch: (search: Record<string, unknown>): { week?: string; fromBoard?: string } => ({
    ...boardReturnSearch(search),
    ...(typeof search["week"] === "string" && isDateKey(search["week"]) ? { week: weekStartFor(search["week"]) } : {}),
  }),
  head: () => ({ meta: [
    { title: "Service week menu · NutriSync" },
    { name: "description", content: "View all seven days of breakfast, lunch and dinner for the service week." },
    { property: "og:title", content: "Service week menu · NutriSync" },
    { property: "og:description", content: "Review the full weekly menu and open each day's resident meal details." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ServiceMenu,
});

function ServiceMenu() {
  const { state, reference } = useKitchen();
  const { week, fromBoard } = Route.useSearch();
  const menu = weeklyMenu(state, week ?? dateKey(reference), reference);
  return <>
    <BoardReturn />
    <PageHeader title="Service week menu"><p className="text-sm text-muted-foreground">{weekRange(menu.startDate, menu.endDate)} · {menu.startDate.slice(0, 4)}</p></PageHeader>
    <div className="space-y-6">
      {menu.days.map((day) => <section key={day.date} aria-label={day.date}>
        <h2 className="mb-3 text-lg font-semibold">{parseDateKey(day.date)?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {day.slots.map((slot) => <article key={slot.meal} className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3">
            <img src={recipePhoto(slot.dishId, slot.dishName)} alt={slot.dishName} className="size-20 shrink-0 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">{MEAL_LABEL[slot.meal]}</p>
              <h3 className="break-words text-sm font-semibold">{slot.dishName}</h3>
              <Button asChild variant="link" size="sm" className="h-auto px-0 py-1"><Link to="/menu/$date" params={{ date: day.date }} search={{ meal: slot.meal, serviceWeek: menu.startDate, ...(fromBoard ? { fromBoard } : {}) }}>View meal<ArrowRight className="size-3.5" /></Link></Button>
            </div>
          </article>)}
        </div>
      </section>)}
    </div>
  </>;
}
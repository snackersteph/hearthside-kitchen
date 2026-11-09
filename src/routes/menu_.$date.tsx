import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { differenceInCalendarDays, isValid, parseISO , addMonths } from "date-fns";
import { PageHeader } from "@/components/kitchen/app-shell";
import { MealSection, PlannedMeal } from "@/components/kitchen/menu-meals";
import { MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { useKitchen } from "@/lib/kitchen/store";
import { MEALS } from "@/lib/kitchen/types";

export const Route = createFileRoute("/menu_/$date")({
  head: ({ params }) => ({ meta: [
    { title: `${params.date} Daily Menu · NutriSync` },
    { name: "description", content: `Breakfast, lunch, dinner and resident alternatives for ${params.date}.` },
    { property: "og:title", content: `${params.date} Daily Menu · NutriSync` },
    { property: "og:description", content: `Review meals and resident alternatives for ${params.date}.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { meal?: "breakfast" | "lunch" | "dinner"; focus?: boolean } => ({
    ...(search["meal"] === "breakfast" || search["meal"] === "lunch" || search["meal"] === "dinner" ? { meal: search["meal"] } : {}),
    ...(search["focus"] === true || search["focus"] === "true" ? { focus: true } : {}),
  }),
  component: DatedMenuPage,
});

function DatedMenuPage() {
  const { date } = Route.useParams();
  const { analysis } = useKitchen();
  const { meal: focusMeal, focus } = Route.useSearch();
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!reference || !focus || !focusMeal) return;
    const t = window.setTimeout(() => document.getElementById(`meal-focus-${focusMeal}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => window.clearTimeout(t);
  }, [reference, focus, focusMeal]);
  if (!reference) return null;
  const selected = parseISO(date);
  if (!isValid(selected) || dateKey(selected) !== date) return <>
    <PageHeader eyebrow="Daily Menu" title="Date unavailable" />
    <Button asChild variant="outline"><Link to="/menu"><ArrowLeft />Back to dates</Link></Button>
  </>;
  const offset = differenceInCalendarDays(selected, reference);
  const minOffset = differenceInCalendarDays(addMonths(reference, -6), reference);
  const maxOffset = differenceInCalendarDays(addMonths(reference, 2), reference);
  if (offset < minOffset || offset > maxOffset) return <>
    <PageHeader eyebrow="Daily Menu" title="Date outside the current menu" />
    <Button asChild variant="outline"><Link to="/menu"><ArrowLeft />Back to dates</Link></Button>
  </>;
  return <>
    <Button asChild variant="ghost" size="sm" className="mb-5"><Link to="/menu"><ArrowLeft />All dates</Link></Button>
    <PageHeader eyebrow="Daily Menu" title={selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}>
      <div className="flex items-center gap-2">
        {offset === 0 && <Tag tone="ok">Today</Tag>}
        {offset > minOffset && <Button asChild variant="outline" size="icon" aria-label="Previous day"><Link to="/menu/$date" params={{ date: dateKey(dayAt(-1, selected)) }}><ChevronLeft /></Link></Button>}
        {offset < maxOffset && <Button asChild variant="outline" size="icon" aria-label="Next day"><Link to="/menu/$date" params={{ date: dateKey(dayAt(1, selected)) }}><ChevronRight /></Link></Button>}
      </div>
    </PageHeader>
    <Tabs key={date} defaultValue={focusMeal ?? "breakfast"}>
      <TabsList className="mb-5 grid h-auto w-full grid-cols-3 gap-1 bg-transparent p-0">
        {MEALS.map((meal) => {
          const review = analysis.mealReviews?.find((r) => r.serviceDate === date && r.meal === meal);
          return <TabsTrigger key={meal} value={meal} className="min-h-16 flex-col gap-1 border border-transparent text-base data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            {MEAL_LABEL[meal]}<span className="text-[11px] font-normal">{offset < 0 ? "Past menu" : review?.approved ? "Approved" : "Needs approval"}</span>
          </TabsTrigger>;
        })}
      </TabsList>
      {MEALS.map((meal) => <TabsContent key={meal} value={meal}>
        <div id={`meal-focus-${meal}`} className={`scroll-mt-6 rounded-xl ${focus && focusMeal === meal ? "border-2 border-warning p-2" : ""}`}>
          {offset < 0 ? <PlannedMeal meal={meal} offset={offset} reference={reference} /> : <MealSection meal={meal} offset={offset} reference={reference} />}
        </div>
      </TabsContent>)}
    </Tabs>
  </>;
}
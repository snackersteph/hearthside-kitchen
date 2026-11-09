import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
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
    { title: `${params.date} Daily Menu · Hearth Kitchen Command` },
    { name: "description", content: `Breakfast, lunch, dinner and resident alternatives for ${params.date}.` },
    { property: "og:title", content: `${params.date} Daily Menu · Hearth Kitchen Command` },
    { property: "og:description", content: `Review meals and resident alternatives for ${params.date}.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DatedMenuPage,
});

function DatedMenuPage() {
  const { date } = Route.useParams();
  const { analysis } = useKitchen();
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  if (!reference) return null;
  const selected = parseISO(date);
  if (!isValid(selected) || dateKey(selected) !== date) return <>
    <PageHeader eyebrow="Daily Menu" title="Date unavailable" />
    <Button asChild variant="outline"><Link to="/menu"><ArrowLeft />Back to dates</Link></Button>
  </>;
  const offset = differenceInCalendarDays(selected, reference);
  if (offset < -7 || offset > 7) return <>
    <PageHeader eyebrow="Daily Menu" title="Date outside the current menu" />
    <Button asChild variant="outline"><Link to="/menu"><ArrowLeft />Back to dates</Link></Button>
  </>;
  return <>
    <Button asChild variant="ghost" size="sm" className="mb-5"><Link to="/menu"><ArrowLeft />All dates</Link></Button>
    <PageHeader eyebrow="Daily Menu" title={selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}>
      <div className="flex items-center gap-2">
        {offset === 0 && <Tag tone="ok">Today</Tag>}
        {offset > -7 && <Button asChild variant="outline" size="icon" aria-label="Previous day"><Link to="/menu/$date" params={{ date: dateKey(dayAt(-1, selected)) }}><ChevronLeft /></Link></Button>}
        {offset < 7 && <Button asChild variant="outline" size="icon" aria-label="Next day"><Link to="/menu/$date" params={{ date: dateKey(dayAt(1, selected)) }}><ChevronRight /></Link></Button>}
      </div>
    </PageHeader>
    <Tabs key={date} defaultValue="breakfast">
      <TabsList className="mb-5 grid h-auto w-full grid-cols-3 gap-1 bg-transparent p-0">
        {MEALS.map((meal) => {
          const review = analysis.mealReviews?.find((r) => r.serviceDate === date && r.meal === meal);
          return <TabsTrigger key={meal} value={meal} className="min-h-16 flex-col gap-1 border border-transparent text-base data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            {MEAL_LABEL[meal]}<span className="text-[11px] font-normal">{offset < 0 ? "Past menu" : review?.approved ? "Approved" : "Needs approval"}</span>
          </TabsTrigger>;
        })}
      </TabsList>
      {MEALS.map((meal) => <TabsContent key={meal} value={meal}>
        {offset < 0 ? <PlannedMeal meal={meal} offset={offset} reference={reference} /> : <MealSection meal={meal} offset={offset} reference={reference} />}
      </TabsContent>)}
    </Tabs>
  </>;
}
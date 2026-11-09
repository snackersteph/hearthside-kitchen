import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, CalendarDays } from "lucide-react";
import { type DayButton } from "react-day-picker";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Tag } from "@/components/kitchen/agents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/menu")({
  head: () => ({ meta: [
    { title: "Menu Calendar · Hearth Kitchen Command" },
    { name: "description", content: "Browse daily menus and see which service dates still need staff approval." },
    { property: "og:title", content: "Menu Calendar · Hearth Kitchen Command" },
    { property: "og:description", content: "Browse daily menus and see which service dates still need staff approval." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MenuPage,
});

function MenuPage() {
  const { analysis } = useKitchen();
  const navigate = useNavigate();
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  if (!reference) return null;
  const today = dateKey(reference);
  const start = dayAt(-7, reference);
  const end = dayAt(7, reference);
  const reviews = analysis.mealReviews ?? [];
  const daysPending = new Set(reviews.filter((review) => !review.approved).map((review) => review.serviceDate)).size;

  function MenuDay(props: React.ComponentProps<typeof DayButton>) {
    const key = dateKey(props.day.date);
    const dayReviews = reviews.filter((review) => review.serviceDate === key);
    const pending = dayReviews.filter((review) => !review.approved).length;
    const past = key < today;
    const inRange = props.day.date >= start && props.day.date <= end;
    return <CalendarDayButton {...props}
      aria-label={`${props.day.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${past ? "past menu" : `${pending} meals need approval`}`}
      className={cn("h-24 gap-2 rounded-lg border border-transparent text-base md:h-28", key === today && "border-primary", !inRange && "opacity-35")}>
      <span className="font-semibold">{props.day.date.getDate()}</span>
      {inRange && <span className={cn("flex items-center gap-1 text-[10px] font-medium md:text-xs", past ? "text-muted-foreground" : pending ? "text-accent-foreground" : "text-success")}>
        {past ? "Past" : pending ? <><ClipboardCheck className="size-3 shrink-0" /><span>{pending}<span className="hidden sm:inline"> to approve</span></span></> : <><CheckCircle2 className="size-3 shrink-0" /><span className="hidden sm:inline">Approved</span></>}
      </span>}
    </CalendarDayButton>;
  }

  return <>
    <PageHeader eyebrow="Menu calendar" title="Daily Menu">
      <Tag tone={daysPending ? "warn" : "ok"}>{daysPending} days need approval</Tag>
    </PageHeader>
    <section aria-label="Choose a menu date" className="border-y py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5" />Choose a date</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ClipboardCheck className="size-4 text-accent-foreground" />Needs approval</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" />Approved</span>
        </div>
      </div>
      <Calendar mode="single" month={reference} today={reference} startMonth={start} endMonth={end}
        disabled={[{ before: start }, { after: end }]}
        onSelect={(date) => { if (date) navigate({ to: "/menu/$date", params: { date: dateKey(date) } }); }}
        className="pointer-events-auto w-full bg-transparent p-0"
        classNames={{ root: "w-full", months: "relative w-full min-w-0", month: "flex w-full min-w-0 flex-col gap-4", table: "block w-full", month_caption: "flex h-10 items-center justify-center", caption_label: "text-lg font-semibold", weekdays: "grid w-full grid-cols-7 border-b pb-3", week: "mt-2 grid w-full grid-cols-7 gap-1", day: "relative w-full min-w-0 p-0 text-center" }}
        components={{ DayButton: MenuDay }} />
    </section>
  </>;
}
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, CalendarDays, CirclePlus } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey } from "@/lib/kitchen/schedule";
import { calendarWindow } from "@/lib/kitchen/calendar-window";
import { isMenuCleared } from "@/lib/kitchen/menu-reset";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Tag } from "@/components/kitchen/agents";
import { cn } from "@/lib/utils";
import { alternativeOverview, calendarWeekApproval, residentApprovalCount } from "@/components/kitchen/approval-rules";
import { weekRange } from "@/lib/kitchen/weekly-operations";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/menu")({
  head: () => ({ meta: [
    { title: "Calendar · NutriSync" },
    { name: "description", content: "Browse daily menus and see which service dates still need staff approval." },
    { property: "og:title", content: "Calendar · NutriSync" },
    { property: "og:description", content: "Browse daily menus and see which service dates still need staff approval." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MenuPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MenuPage() {
  const { state } = useKitchen();
  const navigate = useNavigate();
  const [reference, setReference] = useState<Date | null>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const calendar = reference ? calendarWindow(reference, shift) : null;
  const startKey = calendar ? dateKey(calendar.start) : "";
  // Only the four visible weeks are analysed, so the page never scores dates it cannot show.
  const overview = useMemo(
    () => (reference && calendar ? alternativeOverview(state, reference, calendar.dates) : []),
    [state, reference, startKey],
  );

  if (!reference || !calendar) return null;
  const ref = reference;
  const today = dateKey(ref);
  const { weeks, rangeStart, rangeEnd, canPrev, canNext, caption } = calendar;
  const daysPending = overview.filter((day) => day.pending.length > 0).length;

  function DayCell({ date }: { date: Date }) {
    const key = dateKey(date);
    const day = overview.find((entry) => entry.date === key);
    const pending = residentApprovalCount(day?.pending ?? []);
    const past = key < today;
    const cleared = !past && isMenuCleared(state, key);
    const status = cleared ? "Not started" : pending ? `${pending} to approve` : day?.unresolved.length ? "Needs approval" : "Approved";
    const isToday = key === today;
    if (date < rangeStart || date > rangeEnd) {
      return <div aria-hidden className="h-24 rounded-lg border border-transparent opacity-35 md:h-28" />;
    }
    return <Link to="/menu/$date" params={{ date: key }}
      aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${isToday ? "today, " : ""}${past ? "Completed" : status}`}
      className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-transparent text-base transition hover:bg-accent focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] md:h-28">
      <span className={cn("font-semibold", isToday && "flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground")}>{date.getDate()}</span>
      <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold md:text-xs", past || cleared ? "bg-muted text-muted-foreground" : pending ? "bg-danger-soft text-destructive" : "bg-success-soft text-primary")}>
        {past ? <><CheckCheck className="size-3 shrink-0" /><span>Completed</span></>
          : cleared ? <><CirclePlus className="size-3 shrink-0" /><span className="hidden sm:inline">Not started</span></>
          : pending ? <><ClipboardCheck className="size-3 shrink-0" /><span>{pending}<span className="hidden sm:inline"> to approve</span></span></>
          : <><CheckCircle2 className="size-3 shrink-0" /><span className="hidden sm:inline">{status}</span></>}
      </span>
    </Link>;
  }

  // Calendar rows summarize resident approvals; workflow lifecycle remains in the Agent Workspace.
  function WeekRow({ week }: { week: Date[] }) {
    const start = week[0];
    const end = week[week.length - 1];
    if (!start || !end) return null;
    const info = calendarWeekApproval(overview, dateKey(start), dateKey(end), ref);
    const weekCleared = dateKey(start) > today && week.every((day) => isMenuCleared(state, dateKey(day)));
    const label = weekCleared ? "Not started" : info.status === "pending" ? `${info.pending} to approve` : info.status === "unresolved" ? "Needs approval" : info.status === "approved" ? "Approved" : info.status === "past" ? "Completed" : "Approved";
    const range = weekRange(dateKey(start), dateKey(end));
    return <div className="mt-2">
      <div className="menu-week-status" aria-label={`Service week ${range}: ${label}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="hidden whitespace-nowrap font-medium text-muted-foreground sm:inline">Week of {range}</span>
          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", weekCleared ? "bg-muted text-muted-foreground" : info.status === "pending" || info.status === "unresolved" ? "bg-danger-soft text-destructive" : info.status === "past" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success")}>
            {weekCleared ? <CirclePlus className="size-3 shrink-0" /> : info.status === "pending" || info.status === "unresolved" ? <ClipboardCheck className="size-3 shrink-0" /> : info.status === "past" ? <CheckCheck className="size-3 shrink-0" /> : <CheckCircle2 className="size-3 shrink-0" />}{label}
          </span>
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={() => navigate({ to: "/dashboard", search: { week: dateKey(start), fromMenu: true } })}>
          Open in Agent Workspace
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
      <div className="grid w-full grid-cols-7 gap-1">
        {week.map((date) => <DayCell key={dateKey(date)} date={date} />)}
      </div>
    </div>;
  }

  return <>
    <PageHeader title="Calendar">
      <Tag tone={daysPending ? "warn" : "ok"}>{daysPending} days need approval</Tag>
    </PageHeader>
    <section aria-label="Choose a menu date" className="border-b py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5" />Choose a date</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ClipboardCheck className="size-4 text-destructive" />Needs approval</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" />Approved</span>
          <span className="flex items-center gap-1.5"><CheckCheck className="size-4" />Completed</span>
          <span className="flex items-center gap-1.5"><CirclePlus className="size-4" />Not started</span>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">{caption}</p>
        <div className="flex items-center gap-1">
          {shift !== 0 && <Button type="button" variant="outline" size="sm" onClick={() => setShift(0)}>This week</Button>}
          <Button type="button" variant="outline" size="icon" aria-label="Previous four weeks" disabled={!canPrev} onClick={() => setShift((value) => value - 1)}><ChevronLeft /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Next four weeks" disabled={!canNext} onClick={() => setShift((value) => value + 1)}><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid w-full grid-cols-7 gap-1 border-b pb-3 text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((label) => <span key={label} className="text-center">{label}</span>)}
      </div>
      {weeks.map((week) => <WeekRow key={dateKey(week[0]!)} week={week} />)}
    </section>
  </>;
}

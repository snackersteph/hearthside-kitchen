import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths } from "date-fns";
import { ArrowRight, CheckCircle2, CheckCheck, ClipboardCheck, CalendarDays, CirclePlus } from "lucide-react";
import { type DayButton, type WeekProps } from "react-day-picker";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { isMenuCleared } from "@/lib/kitchen/menu-reset";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
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

function MenuPage() {
  const { state } = useKitchen();
  const navigate = useNavigate();
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const overview = useMemo(() => reference ? alternativeOverview(state, reference) : [], [state, reference]);
  if (!reference) return null;
  const today = dateKey(reference);
  const start = addMonths(dayAt(0, reference), -6);
  const end = addMonths(dayAt(0, reference), 2);
  const daysPending = overview.filter((day) => day.pending.length > 0).length;

  function MenuDay(props: React.ComponentProps<typeof DayButton>) {
    const key = dateKey(props.day.date);
    const day = overview.find((day) => day.date === key);
    const pending = residentApprovalCount(day?.pending ?? []);
    const past = key < today;
    const cleared = !past && isMenuCleared(state, key);
    const status = cleared ? "Not started" : pending ? `${pending} to approve` : day?.unresolved.length ? "Needs attention" : day?.approved.length ? "Approved" : "No approvals";
    const isToday = key === today;
    const inRange = props.day.date >= start && props.day.date <= end;
    return <CalendarDayButton {...props}
      aria-label={`${props.day.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${isToday ? "today, " : ""}${past ? "Completed" : status}`}
      className={cn("[&>span]:opacity-100 h-24 gap-2 rounded-lg border border-transparent text-base md:h-28", !inRange && "opacity-35")}>
      <span className={cn("font-semibold", isToday && "flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground")}>{props.day.date.getDate()}</span>
      {inRange && <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold md:text-xs", past || cleared ? "bg-muted text-muted-foreground" : pending ? "bg-danger-soft text-destructive" : "bg-success-soft text-primary")}>
        {past ? <><CheckCheck className="size-3 shrink-0" /><span>Completed</span></> : cleared ? <><CirclePlus className="size-3 shrink-0" /><span className="hidden sm:inline">Not started</span></> : pending ? <><ClipboardCheck className="size-3 shrink-0" /><span>{pending}<span className="hidden sm:inline"> to approve</span></span></> : <><CheckCircle2 className="size-3 shrink-0" /><span className="hidden sm:inline">{status}</span></>}
      </div>}
    </CalendarDayButton>;
  }

  // Calendar rows summarize resident approvals; workflow lifecycle remains in the Agent Workspace.
  function ServiceWeek({ week, children, ...props }: WeekProps) {
    const monday = week.days[0]?.date;
    if (!monday || !reference) return <tr {...props}>{children}</tr>;
    const sunday = week.days[6]?.date ?? monday;
    const inRange = sunday >= start && monday <= end;
    const info = inRange ? calendarWeekApproval(overview, dateKey(monday), dateKey(sunday), reference) : null;
    const weekCleared = inRange && dateKey(monday) > today && week.days.every((day) => isMenuCleared(state, dateKey(day.date)));
    const label = weekCleared ? "Not started" : info?.status === "pending" ? `${info.pending} to approve` : info?.status === "unresolved" ? "Needs attention" : info?.status === "approved" ? "Approved" : info?.status === "past" ? "Completed" : "No approvals";
    const range = weekRange(dateKey(monday), dateKey(sunday));
    return <tr {...props}>
      {info && <td className="col-span-7">
        <div className="menu-week-status" aria-label={`Service week ${range}: ${label}`}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="hidden whitespace-nowrap font-medium text-muted-foreground sm:inline">Week of {range}</span>
            <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", weekCleared ? "bg-muted text-muted-foreground" : info.status === "pending" || info.status === "unresolved" ? "bg-danger-soft text-destructive" : info.status === "past" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success")}>
              {weekCleared ? <CirclePlus className="size-3 shrink-0" /> : info.status === "pending" || info.status === "unresolved" ? <ClipboardCheck className="size-3 shrink-0" /> : info.status === "past" ? <CheckCheck className="size-3 shrink-0" /> : <CheckCircle2 className="size-3 shrink-0" />}{label}
            </span>
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={() => navigate({ to: "/dashboard", search: { week: dateKey(monday), fromMenu: true } })}>
            Open in Agent Workspace
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </td>}
      {children}
    </tr>;
  }

  return <>
    <PageHeader title="Calendar">
      <Tag tone={daysPending ? "warn" : "ok"}>{daysPending} days need approval</Tag>
    </PageHeader>
    <section aria-label="Choose a menu date" className="border-y py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5" />Choose a date</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ClipboardCheck className="size-4 text-destructive" />Needs approval</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" />Approved</span>
        </div>
      </div>
      <Calendar mode="single" weekStartsOn={1} defaultMonth={reference} today={reference} startMonth={start} endMonth={end}
        disabled={[{ before: start }, { after: end }]}
        onSelect={(date) => { if (date) navigate({ to: "/menu/$date", params: { date: dateKey(date) } }); }}
        className="pointer-events-auto w-full bg-transparent p-0"
        classNames={{ root: "w-full", months: "relative w-full min-w-0", month: "flex w-full min-w-0 flex-col gap-4", table: "block w-full", month_caption: "flex h-10 items-center justify-center", caption_label: "text-lg font-semibold", weekdays: "grid w-full grid-cols-7 border-b pb-3", week: "mt-2 grid w-full grid-cols-7 gap-1", day: "relative w-full min-w-0 p-0 text-center", today: "bg-transparent text-foreground" }}
        components={{ DayButton: MenuDay, Week: ServiceWeek }} />
    </section>
  </>;
}
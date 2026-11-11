import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  ClipboardCheck,
  Clock,
  Minus,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  UserCheck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar } from "@/components/kitchen/agents";
import { dishById } from "@/lib/kitchen/data";
import { useKitchen, useWeeklyMenu } from "@/lib/kitchen/store";
import type { KitchenState, Meal } from "@/lib/kitchen/types";
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  agentActivity,
  canStartWeeklyWorkflow,
  latestRunFor,
  pendingRevisions,
  residentConstraints,
  runEvents,
  weeklyApprovalChecks,
  type AgentAction,
  type AgentActivity,
  type AgentEvent,
  type AgentEventStatus,
  type AgentParty,
  type AgentRole,
  type WeeklyApprovalChecks,
  type WorkflowRun,
} from "@/lib/kitchen/agent-workflow";
import type { WeeklyMenu, WeeklyMenuSlot } from "@/lib/kitchen/weekly-menu";
import {
  addDays,
  approvalTiming,
  lifecycleDates,
  parseDateKey,
  phaseFor,
  weekStartFor,
  weeklyPlanId,
  type WeeklyMenuStatus,
  type WeeklyPhase,
  type WeeklyPlan,
} from "@/lib/kitchen/weekly-schedule";
import { dateKey } from "@/lib/kitchen/schedule";
import { weekStatus } from "@/lib/kitchen/weekly-operations";
import { WeekStatusBadge } from "@/components/kitchen/week-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AGENT_INFO,
  AGENT_ORDER,
  MEAL_ROWS,
  STAGE_INFO,
  TOTAL_MEALS,
  WEEK_DAYS,
  type AgentId,
} from "@/lib/kitchen/weekly-plan";

type CellStatus = "unplanned" | "planned" | "passed" | "review" | "approved";
type StageState = "done" | "active" | "upcoming" | "overdue";

export const HANDOFF_STYLE: Record<AgentEventStatus, { icon: LucideIcon; label: string; badge: string }> =
  {
    completed: { icon: CheckCircle2, label: "Completed", badge: "bg-success-soft text-success" },
    warning: { icon: TriangleAlert, label: "Warning", badge: "bg-warning-soft text-warning" },
    pending: { icon: Clock, label: "Pending", badge: "bg-muted text-muted-foreground" },
  };

const STAGE_STATUS_LABEL: Record<AgentEventStatus, string> = {
  completed: "Completed",
  warning: "Warning — Requires Resolution",
  pending: "Needs Review",
};

const ACTIVITY_LABEL: Record<AgentActivity, { label: string; badge: string }> = {
  idle: { label: "Idle", badge: "bg-muted text-muted-foreground" },
  working: { label: "Working", badge: "bg-accent text-accent-foreground" },
  "waiting-agent": { label: "Waiting on another agent", badge: "bg-accent text-accent-foreground" },
  "waiting-manager": { label: "Waiting on Manager", badge: "bg-warning-soft text-warning" },
  completed: { label: "Completed", badge: "bg-success-soft text-success" },
  blocked: { label: "Blocked", badge: "bg-destructive/10 text-destructive" },
};

const WEEKLY_STATUS_LABEL: Record<WeeklyMenuStatus, string> = {
  "not-started": "Not Started",
  generating: "Generating",
  "needs-review": "Needs Review",
  approved: "Approved",
};

const PHASE_LABEL: Record<WeeklyPhase, string> = {
  upcoming: "Upcoming week",
  planning: "Planning week",
  purchasing: "Purchasing week",
  service: "Service week",
  completed: "Completed week",
};

export const PARTY_LABEL: Record<AgentParty, string> = {
  dietary: "Dietary Agent",
  menu: "Menu Agent",
  inventory: "Inventory Agent",
  team: "AI Team",
  manager: "Kitchen Manager",
};

export const ACTION_LABEL: Record<AgentAction, string> = {
  "share-dietary-constraints": "Shared dietary constraints",
  "send-ingredient-requirements": "Sent ingredient requirements",
  "report-shortage": "Reported stock findings",
  "confirm-stock": "Confirmed stock",
  "propose-revision": "Proposed a revision",
  "recommend-purchase": "Drafted purchasing",
  "revalidate-dietary": "Rechecked dietary safety",
  "revalidate-inventory": "Rechecked stock",
  "validate-week": "Validated the week",
  "request-approval": "Requested approval",
  "approve-revision": "Revision approved",
  "decline-revision": "Revision declined",
  "replace-revision": "Another option requested",
  "approve-week": "Week approved",
  "revalidation-required": "Revalidation required",
};

/** Why each kind of handoff happens (the event itself says what was exchanged). */
function handoffReason(e: AgentEvent): string {
  switch (e.action) {
    case "share-dietary-constraints":
      return "The Menu Agent can't choose safe meals without each resident's documented restrictions.";
    case "send-ingredient-requirements":
      return "Every planned meal must be checked against stock and scheduled deliveries before the plan is final.";
    case "report-shortage":
      return e.structuredPayload.kind === "shortage"
        ? "Stock runs out before a new order could arrive, so the menu itself must change."
        : "Some ingredients will run short but can still be ordered in time, so the Menu Agent can keep the plan.";
    case "confirm-stock":
      return "Stock covers the plan, so no menu changes are needed for inventory.";
    case "propose-revision":
      return e.structuredPayload.kind === "revision"
        ? "A shortage can't be fixed by purchasing in time; a catalog alternative avoids it."
        : "The Menu Agent looked for an alternative and could not find one.";
    case "recommend-purchase":
      return "Shortfalls need an order. Purchase approval is a separate manager decision.";
    case "revalidate-dietary":
      return "A changed dish must be rechecked against every resident's requirements.";
    case "revalidate-inventory":
      return "A changed dish changes ingredient demand, so stock must be rechecked.";
    case "validate-week":
      return "Final dietary check across all 21 meals before manager review.";
    case "request-approval":
      return "Agents can't approve their own proposals. The kitchen manager decides.";
    case "approve-revision":
    case "decline-revision":
    case "replace-revision":
      return "Manager decision on a proposed revision.";
    case "approve-week":
      return "Manager sign-off for the weekly menu.";
    case "revalidation-required":
      return "The approved plan changed, so its approval no longer covers the changed meals.";
  }
}

/** Ingredient(s) a handoff is about, read from its structured payload. */
function affectedIngredients(e: AgentEvent, events: AgentEvent[]): string[] {
  const p = e.structuredPayload;
  switch (p.kind) {
    case "shortage":
      return [p.finding.name];
    case "purchasable-shortages":
      return p.findings.map((f) => f.name);
    case "revision":
      return [p.proposal.ingredientName];
    case "purchase":
      return p.lines.map((l) => l.name);
    case "revalidation":
    case "decision": {
      const source = events.find((x) => x.eventId === p.proposalEventId);
      return source?.structuredPayload.kind === "revision"
        ? [source.structuredPayload.proposal.ingredientName]
        : [];
    }
    default:
      return [];
  }
}

/** The receiving party's reply: its next event in the run, or the manager's decision. */
function handoffResponse(
  e: AgentEvent,
  events: AgentEvent[],
  run: WorkflowRun | undefined,
): string {
  if (e.receivingAgent === "manager") {
    const decision =
      events.find(
        (x) =>
          x.structuredPayload.kind === "decision" &&
          x.structuredPayload.proposalEventId === e.eventId,
      ) ??
      (e.action === "request-approval"
        ? events.find((x) => x.action === "approve-week" && x.timestamp >= e.timestamp)
        : undefined);
    if (decision) return decision.summary;
    return run?.status === "awaiting-approval"
      ? "Awaiting your decision."
      : "No decision recorded.";
  }
  if (e.receivingAgent === "team") return "Recorded for the AI team.";
  const index = events.indexOf(e);
  const reply = events.slice(index + 1).find((x) => x.sendingAgent === e.receivingAgent);
  if (reply) return `${PARTY_LABEL[reply.sendingAgent]}: ${reply.summary}`;
  return run?.status === "running" ? "Waiting for a response…" : "No further response was needed.";
}

const CELL_STYLE: Record<CellStatus, string> = {
  unplanned: "bg-muted text-muted-foreground",
  planned: "border border-dashed border-primary/50 bg-card text-foreground",
  passed: "bg-success-soft text-success",
  review: "bg-warning-soft text-warning",
  approved: "bg-success text-success-foreground",
};

const CELL_DOT: Record<CellStatus, string> = {
  unplanned: "bg-muted",
  planned: "border border-dashed border-primary bg-card",
  passed: "bg-success-soft",
  review: "bg-warning-soft",
  approved: "bg-success",
};

const CELL_ICON: Record<CellStatus, LucideIcon> = {
  unplanned: Minus,
  planned: CircleDashed,
  passed: Check,
  review: TriangleAlert,
  approved: CheckCircle2,
};

const CELL_LABEL: Record<CellStatus, string> = {
  unplanned: "Not planned",
  planned: "Planned",
  passed: "Checks passed",
  review: "Needs review",
  approved: "Approved",
};

const STAGE_STATE_STYLE: Record<StageState, { label: string; badge: string; icon: LucideIcon }> = {
  done: { label: "Complete", badge: "bg-success-soft text-success", icon: CheckCircle2 },
  active: { label: "In progress", badge: "bg-accent text-accent-foreground", icon: Clock },
  upcoming: { label: "Upcoming", badge: "bg-muted text-muted-foreground", icon: CircleDashed },
  overdue: { label: "Overdue", badge: "bg-danger-soft text-destructive", icon: TriangleAlert },
};

const START_REFUSAL: Record<string, string> = {
  "week-ended": "This service week has ended, so its menu can no longer be generated.",
  "week-approved":
    "This week's menu is approved. Changes now require an explicit revision from the Daily Menu.",
};

function weekRangeLabel(start: string) {
  const a = parseDateKey(start)!;
  const b = parseDateKey(addDays(start, 6))!;
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
    : `${month(a)} ${a.getDate()}${a.getFullYear() !== b.getFullYear() ? `, ${a.getFullYear()}` : ""}–${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
}
const shortDate = (date: string) =>
  parseDateKey(date)?.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? date;
const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const mealLabel = (meal: Meal) => `${meal[0]!.toUpperCase()}${meal.slice(1)}`;

const isPlanned = (slot: WeeklyMenuSlot) => slot.source === "saved" || slot.lock === "past";
const slotKey = (date: string | null, meal: Meal | null) => `${date}|${meal}`;
const worst = (events: AgentEvent[]): AgentEventStatus =>
  events.some((e) => e.status === "warning")
    ? "warning"
    : events.some((e) => e.status === "pending")
      ? "pending"
      : "completed";

/** What each agent is responsible for right now, and whom it is waiting on. */
function agentDuty(
  id: AgentRole,
  activity: AgentActivity,
  run: WorkflowRun | undefined,
  pendingDecisions: number,
): { duty: string; waitingOn: string | null } {
  if (!run || activity === "idle")
    return { duty: "Idle until the weekly plan is generated.", waitingOn: null };
  if (activity === "blocked")
    return { duty: run.stopReason ?? "The run stopped.", waitingOn: null };
  if (activity === "completed") return { duty: "Checks complete for this week.", waitingOn: null };
  if (activity === "waiting-manager") {
    return {
      duty: pendingDecisions
        ? `${pendingDecisions} proposed revision${pendingDecisions > 1 ? "s" : ""} awaiting your decision.`
        : "Weekly plan awaiting your approval.",
      waitingOn: "Kitchen Manager",
    };
  }
  const next = run.step + 1;
  if (activity === "waiting-agent") {
    return {
      duty:
        next === 3
          ? "Holding the draft menu while stock is checked."
          : "Holding proposed revisions while they are rechecked.",
      waitingOn: next === 3 ? "Inventory Agent" : "Dietary and Inventory Agents",
    };
  }
  const duties: Record<AgentRole, Record<number, string>> = {
    dietary: {
      1: "Reviewing resident dietary profiles.",
      5: "Rechecking proposed revisions against resident requirements.",
    },
    menu: {
      2: "Generating the 21 primary meals from the recipe catalog.",
      4: "Proposing revisions for meals that can't be supplied in time.",
    },
    inventory: {
      3: "Projecting stock against this week's ingredient requirements.",
      4: "Drafting purchasing needs for the week.",
      5: "Rechecking stock for proposed revisions.",
    },
  };
  return { duty: duties[id][next] ?? "Working on this week's plan.", waitingOn: null };
}

/**
 * `week` (a date in the service week, e.g. from the menu calendar or Kitchen Pulse) selects the
 * week; without it the workspace opens on the selected week, else the week now in planning.
 */
export function AgentWorkspace({
  week,
  onWeekChange,
}: { week?: string | undefined; onWeekChange?: ((weekStart: string) => void) | undefined } = {}) {
  const { state, dispatch, reference } = useKitchen();
  const today = dateKey(reference);
  const selectedPlan = state.weeklyPlans?.find((p) => p.id === state.selectedWeekId);
  // Default to the week now in its planning phase (two weeks out).
  const [localWeek, setLocalWeek] = useState(
    () => selectedPlan?.startDate ?? addDays(weekStartFor(today), 14),
  );
  const weekStart = week ? weekStartFor(week) : localWeek;
  const setWeekStart = (next: string) => {
    setLocalWeek(next);
    onWeekChange?.(next);
  };
  // A linked week becomes the selected service week once its plan exists.
  const linkedWeekId = week ? weeklyPlanId(weekStartFor(week)) : null;
  const linkedPlanExists =
    !!linkedWeekId && !!state.weeklyPlans?.some((p) => p.id === linkedWeekId);
  useEffect(() => {
    if (linkedWeekId && linkedPlanExists) dispatch({ type: "selectServiceWeek", id: linkedWeekId });
  }, [linkedWeekId, linkedPlanExists, dispatch]);
  const weekInfo = weekStatus(state, weekStart, reference);
  const weekId = weeklyPlanId(weekStart);
  const plan = state.weeklyPlans?.find((p) => p.id === weekId);
  const menu = useWeeklyMenu(weekStart)!;
  const run = latestRunFor(state, weekId);
  const activeRun = run && run.status !== "superseded" ? run : undefined;
  const events = useMemo(
    () => (activeRun ? runEvents(state, activeRun.workflowRunId) : []),
    [state, activeRun],
  );
  const [selectedHandoff, setSelectedHandoff] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ day: number; meal: number } | null>(null);

  const changeWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelectedHandoff(null);
    if (state.weeklyPlans?.some((p) => p.id === weeklyPlanId(next)))
      dispatch({ type: "selectServiceWeek", id: weeklyPlanId(next) });
  };

  const running = activeRun?.status === "running";
  const awaiting = activeRun?.status === "awaiting-approval";
  const status: WeeklyMenuStatus = running ? "generating" : (plan?.menuStatus ?? "not-started");
  const refusal = canStartWeeklyWorkflow(state, weekStart, reference);
  const phase = phaseFor(weekStart, reference);

  const pendingRevs = activeRun ? pendingRevisions(state, activeRun.workflowRunId) : [];
  const pendingRevKeys = new Set(pendingRevs.map((e) => slotKey(e.affectedDate, e.affectedMeal)));
  // "shortage" events are real conflicts (can't be delivered in time); the rest go to purchasing.
  const shortageEvents = events.filter((e) => e.structuredPayload.kind === "shortage");
  const purchasableCount = events.reduce(
    (n, e) =>
      n +
      (e.structuredPayload.kind === "purchasable-shortages"
        ? e.structuredPayload.findings.length
        : 0),
    0,
  );
  const checked = !!activeRun && activeRun.step >= 3;
  const planned = menu.slots.filter(isPlanned).length;
  const pendingAlternatives = menu.slots.reduce((n, x) => n + x.pendingAlternatives, 0);
  const approvalChecks = useMemo(
    () => weeklyApprovalChecks(state, weekId, reference),
    [state, weekId, reference],
  );
  const weekApproved = plan?.menuStatus === "approved";

  const constraints = residentConstraints(state);
  const activities = agentActivity(activeRun);
  const agentSummaries: Record<AgentId, string> = {
    dietary: `${constraints.restricted} of ${state.residents.length} residents have dietary restrictions affecting this week`,
    menu: `${planned} of ${TOTAL_MEALS} meals planned · ${pendingAlternatives} resident alternatives awaiting approval`,
    inventory: checked
      ? `Found ${purchasableCount + shortageEvents.length} ingredients to purchase for this week; ${shortageEvents.length ? `${shortageEvents.length} can't arrive in time` : "all can arrive in time"}`
      : "Stock not yet checked for this week",
  };

  const handoff =
    events.find((e) => e.eventId === selectedHandoff) ??
    events.find((e) => e.status === "warning") ??
    events.at(-1);

  const cellStatusOf = (slot: WeeklyMenuSlot): CellStatus => {
    if (!isPlanned(slot)) return "unplanned";
    if (slot.needsRevalidation) return "review";
    if (weekApproved || slot.approved) return "approved";
    if (
      pendingRevKeys.has(slotKey(slot.date, slot.meal)) ||
      slot.unresolved > 0 ||
      slot.pendingAlternatives > 0
    )
      return "review";
    return checked ? "passed" : "planned";
  };

  return (
    <>
      <PageHeader eyebrow="Agents" title="Agent Dashboard" />
      <p className="-mt-4 mb-1 text-muted-foreground">
        Supervise how your AI team plans each service week, from menu to purchasing to service.
      </p>
      <p className="mb-6 text-xs text-muted-foreground">
        The agents are rule-based: each step runs NutriSync's deterministic dietary, menu and
        inventory checks on this week's residents, recipes, stock and orders. No AI model is called.
      </p>

      {/* 1 · Week selector */}
      <section
        aria-label="Service week"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-soft"
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => changeWeek(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-52 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Service week · Mon–Sun
            </p>
            <p className="font-semibold">{weekRangeLabel(weekStart)}</p>
            <p className="text-xs text-muted-foreground">{PHASE_LABEL[phase]}</p>
            <WeekStatusBadge info={weekInfo} className="mt-1" />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => changeWeek(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Menu</span>
          <span
            aria-label={`Menu approval status: ${WEEKLY_STATUS_LABEL[status]}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              status === "approved"
                ? "bg-success-soft text-success"
                : status === "needs-review"
                  ? "bg-warning-soft text-warning"
                  : status === "generating"
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground",
            )}
          >
            {WEEKLY_STATUS_LABEL[status]}
          </span>
          {refusal !== "week-approved" && refusal !== "week-ended" && (
            <Button
              onClick={() => dispatch({ type: "startWeeklyWorkflow", date: weekStart })}
              disabled={refusal !== null}
            >
              <Sparkles className="size-4" />
              {running
                ? `Generating… step ${Math.min(activeRun.step + 1, WORKFLOW_STEPS)} of ${WORKFLOW_STEPS}`
                : awaiting
                  ? "Regenerate Weekly Plan"
                  : "Generate Weekly Plan"}
            </Button>
          )}
        </div>
      </section>

      {refusal && START_REFUSAL[refusal] && (
        <p className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {START_REFUSAL[refusal]}
        </p>
      )}
      {activeRun?.status === "stopped" && (
        <p className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          The last run stopped: {activeRun.stopReason}
        </p>
      )}

      {/* 2 · Weekly lifecycle */}
      <WeekLifecycle
        weekStart={weekStart}
        plan={plan}
        leadTimeDays={state.leadTimeDays ?? 2}
        today={today}
      />

      {/* 6 · Handoff inspector (below the weekly lifecycle) */}
      <section
        aria-label="Handoff details"
        className="mb-8 rounded-xl border bg-card p-5 shadow-soft"
      >
        <h2 className="mb-3 text-lg font-semibold">Handoff Inspector</h2>
        {handoff ? (
          <HandoffDetails handoff={handoff} events={events} run={activeRun} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a handoff in the collaboration flow to inspect what the agents exchanged.
          </p>
        )}
      </section>

      {/* 7 · Manager decisions (kept prominent, above the detail) */}
      {(activeRun || weekApproved) && (
        <ManagerDecisions
          weekId={weekId}
          weekStart={weekStart}
          plan={plan}
          menu={menu}
          events={events}
          pendingRevs={pendingRevs}
          checks={approvalChecks}
          running={running}
          pendingAlternatives={pendingAlternatives}
        />
      )}

      {/* 3 · Agent overview */}
      <section aria-label="AI team overview" className="mb-8 grid gap-3 md:grid-cols-3">
        {AGENT_ORDER.map((id) => (
          <AgentCard
            key={id}
            id={id}
            activity={activities[id]}
            latest={events.filter((e) => e.sendingAgent === id).at(-1)}
            summary={agentSummaries[id]}
            {...agentDuty(id, activities[id], activeRun, pendingRevs.length)}
          />
        ))}
      </section>

      {/* 4 · Weekly meal coverage */}
      <section
        aria-label="Weekly meal coverage"
        className="mb-8 rounded-xl border bg-card p-5 shadow-soft"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Weekly meal coverage</h2>
            <p className="text-xs text-muted-foreground">
              {planned} of {TOTAL_MEALS} meals planned · {menu.residentsCovered} of{" "}
              {menu.residentsTotal} residents covered in every meal
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {(["unplanned", "planned", "passed", "review", "approved"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={cn("size-2.5 rounded-full", CELL_DOT[s])} />
                {CELL_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-20 p-1 text-left text-xs font-medium text-muted-foreground">
                  Meal
                </th>
                {menu.days.map((d, i) => (
                  <th
                    key={d.date}
                    className="p-1 text-center text-xs font-medium text-muted-foreground"
                  >
                    {WEEK_DAYS[i]}
                    <span className="block font-normal">{parseDateKey(d.date)?.getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_ROWS.map((meal, mealIdx) => (
                <tr key={meal}>
                  <th className="p-1 text-left text-xs font-semibold">{meal}</th>
                  {menu.days.map((day, dayIdx) => {
                    const slot = day.slots[mealIdx]!;
                    const cell = cellStatusOf(slot);
                    const Icon = CELL_ICON[cell];
                    return (
                      <td key={day.date} className="p-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCell({ day: dayIdx, meal: mealIdx })}
                          aria-label={`${WEEK_DAYS[dayIdx]} ${meal}: ${isPlanned(slot) ? slot.dishName : "not planned"} (${CELL_LABEL[cell]})`}
                          title={
                            isPlanned(slot)
                              ? `${slot.dishName} — ${CELL_LABEL[cell]}`
                              : CELL_LABEL[cell]
                          }
                          className={cn(
                            "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 transition-transform hover:scale-105",
                            CELL_STYLE[cell],
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="line-clamp-1 w-full text-center text-[10px] font-medium leading-tight">
                            {isPlanned(slot) ? slot.dishName : "—"}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5 · Collaboration flow */}
      <div className="mb-8">
        <section aria-label="Collaboration flow">
          <h2 className="mb-4 text-lg font-semibold">Collaboration Flow</h2>
          {!activeRun ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No collaboration yet for this week. Generate the weekly plan to run the agents through
              five stages, from dietary requirements to your review.
            </p>
          ) : (
            <ol className="space-y-4">
              {STAGE_INFO.map((stage) => {
                const stageEvents = events.filter((e) => e.stage === stage.id);
                if (!stageEvents.length) return null;
                const stageStatus = worst(stageEvents);
                const style = HANDOFF_STYLE[stageStatus];
                const bullets = [
                  ...new Set(stageEvents.flatMap((e) => e.structuredPayload.facts)),
                ].slice(0, 4);
                return (
                  <li key={stage.id} className="rounded-xl border bg-card p-5 shadow-soft">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        Stage {stage.id} — {stage.title}
                      </h3>
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          style.badge,
                        )}
                      >
                        <style.icon className="size-3.5" />
                        {STAGE_STATUS_LABEL[stageStatus]}
                      </span>
                    </div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {stage.agents}
                    </p>
                    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <div className="space-y-2">
                      {stageEvents.map((h) => {
                        const hs = HANDOFF_STYLE[h.status];
                        const active = handoff?.eventId === h.eventId;
                        return (
                          <button
                            key={h.eventId}
                            type="button"
                            onClick={() => setSelectedHandoff(h.eventId)}
                            aria-pressed={active}
                            className={cn(
                              "w-full rounded-lg border p-3 text-left transition-colors hover:border-primary",
                              active && "border-primary ring-1 ring-primary",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold">
                                {PARTY_LABEL[h.sendingAgent]}{" "}
                                <ArrowRight className="size-3 text-muted-foreground" />{" "}
                                {PARTY_LABEL[h.receivingAgent]}
                              </span>
                              <span
                                className={cn(
                                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  hs.badge,
                                )}
                              >
                                <hs.icon className="size-3" />
                                {hs.label}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {h.summary}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-sm">
                      <span className="font-medium">Outcome:</span>{" "}
                      <span className="text-muted-foreground">{stageEvents.at(-1)!.result}</span>
                    </p>
                  </li>
                );
              })}
              {running && (
                <li className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <Clock className="size-4 animate-pulse" /> Running step{" "}
                  {Math.min(activeRun.step + 1, WORKFLOW_STEPS)} of {WORKFLOW_STEPS}:{" "}
                  {WORKFLOW_STEP_LABELS[Math.min(activeRun.step, WORKFLOW_STEPS - 1)]}…
                </li>
              )}
            </ol>
          )}
        </section>
      </div>

      {/* Meal details */}
      <Dialog open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent className="max-w-md">
          {selectedCell && (
            <MealCellDetails
              state={state}
              slot={menu.days[selectedCell.day]!.slots[selectedCell.meal]!}
              status={cellStatusOf(menu.days[selectedCell.day]!.slots[selectedCell.meal]!)}
              events={events}
              checked={checked}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function WeekLifecycle({
  weekStart,
  plan,
  leadTimeDays,
  today,
}: {
  weekStart: string;
  plan: WeeklyPlan | undefined;
  leadTimeDays: number;
  today: string;
}) {
  const dates = lifecycleDates(weekStart, leadTimeDays);
  const timing = plan
    ? approvalTiming(plan, leadTimeDays)
    : { menuApprovedLate: false, purchasingApprovedLate: false };
  const menuApproved = plan?.menuStatus === "approved";
  const purchaseApproved = plan?.purchasingStatus === "approved";
  const state = (done: boolean, start: string, due: string, end: string): StageState =>
    done
      ? "done"
      : today > due
        ? "overdue"
        : today >= start && today <= end
          ? "active"
          : today > end
            ? "overdue"
            : "upcoming";
  const serviceState: StageState =
    today > dates.serviceEnd ? "done" : today >= dates.serviceStart ? "active" : "upcoming";
  const stages = [
    {
      key: "menu",
      title: "Plan Menu",
      icon: CalendarCheck,
      window: `${shortDate(dates.planningStart)} – ${shortDate(dates.planningEnd)}`,
      target: `Approve menu by ${shortDate(dates.menuDueDate)}`,
      state: state(menuApproved, dates.planningStart, dates.menuDueDate, dates.planningEnd),
      detail: menuApproved
        ? `Approved ${stamp(plan!.menuApprovedAt!)}${timing.menuApprovedLate ? " (after the target date)" : ""}`
        : `Menu ${WEEKLY_STATUS_LABEL[plan?.menuStatus ?? "not-started"].toLowerCase()}`,
      overdue:
        !menuApproved && today > dates.menuDueDate
          ? `Menu approval overdue since ${shortDate(dates.menuDueDate)}`
          : null,
    },
    {
      key: "purchase",
      title: "Purchase Ingredients",
      icon: ShoppingCart,
      window: `${shortDate(dates.purchasingStart)} – ${shortDate(dates.purchasingEnd)}`,
      target: `Approve orders by ${shortDate(dates.purchasingDueDate)} (${leadTimeDays}-day lead time)`,
      state: state(
        purchaseApproved,
        dates.purchasingStart,
        dates.purchasingDueDate,
        dates.purchasingEnd,
      ),
      detail: purchaseApproved
        ? `Approved ${stamp(plan!.purchasingApprovedAt!)}${timing.purchasingApprovedLate ? " (after the target date)" : ""}`
        : `Purchasing ${plan?.purchasingStatus?.replace("-", " ") ?? "not started"} · approved separately from the menu`,
      overdue:
        !purchaseApproved && today > dates.purchasingDueDate
          ? `Purchase approval overdue since ${shortDate(dates.purchasingDueDate)}`
          : null,
    },
    {
      key: "serve",
      title: "Prepare & Serve",
      icon: UtensilsCrossed,
      window: `${shortDate(dates.serviceStart)} – ${shortDate(dates.serviceEnd)}`,
      target: "21 meals: breakfast, lunch and dinner",
      state: serviceState,
      detail:
        serviceState === "active"
          ? "Service in progress"
          : serviceState === "done"
            ? "Service week completed"
            : `Starts ${shortDate(dates.serviceStart)}`,
      overdue:
        serviceState !== "upcoming" && !menuApproved
          ? "Serving a menu that was never approved"
          : null,
    },
  ];
  return (
    <section
      aria-label="Weekly lifecycle"
      className="mb-6 rounded-xl border bg-card p-5 shadow-soft"
    >
      <h2 className="mb-3 text-lg font-semibold">Weekly lifecycle</h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {stages.map((s, i) => {
          const style = STAGE_STATE_STYLE[s.state];
          return (
            <li
              key={s.key}
              aria-label={`${s.title}: ${style.label}`}
              className={cn(
                "relative rounded-lg border p-4",
                s.state === "active" && "border-primary ring-1 ring-primary",
                s.state === "overdue" && "border-destructive",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <s.icon className="size-4 text-muted-foreground" />
                  {s.title}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    style.badge,
                  )}
                >
                  <style.icon className="size-3" />
                  {style.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{s.window}</p>
              <p className="mt-2 text-sm">{s.target}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
              {s.overdue && (
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-destructive">
                  <TriangleAlert className="size-3.5" />
                  {s.overdue}
                </p>
              )}
              {i < stages.length - 1 && (
                <ArrowRight
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground md:block"
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ManagerDecisions({
  weekId,
  weekStart,
  plan,
  menu,
  events,
  pendingRevs,
  checks,
  running,
  pendingAlternatives,
}: {
  weekId: string;
  weekStart: string;
  plan: WeeklyPlan | undefined;
  menu: WeeklyMenu;
  events: AgentEvent[];
  pendingRevs: AgentEvent[];
  checks: WeeklyApprovalChecks;
  running: boolean;
  pendingAlternatives: number;
}) {
  const { state, dispatch } = useKitchen();
  const weekApproved = plan?.menuStatus === "approved";
  const purchase = events.find((e) => e.structuredPayload.kind === "purchase");
  const approvedRevisions = events.filter((e) => e.action === "approve-revision");
  const revalidationCount = menu.slots.filter((x) => x.needsRevalidation).length;
  const planned = menu.slots.filter(isPlanned).length;
  return (
    <section
      aria-label="Manager decisions"
      className={cn(
        "mb-8 rounded-xl border p-5 shadow-soft",
        weekApproved
          ? "border-success bg-success-soft/40"
          : pendingRevs.length || !checks.ready
            ? "border-warning bg-card"
            : "bg-card",
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {weekApproved ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <UserCheck className="size-5 text-warning" />
        )}
        {weekApproved ? "Weekly Menu Approved" : "Manager Decisions"}
      </h2>

      {weekApproved ? (
        <>
          <p className="text-sm text-muted-foreground">
            The {TOTAL_MEALS}-meal plan for {weekRangeLabel(weekStart)} is recorded in the daily
            menu
            {plan?.menuApprovedAt ? ` (approved ${stamp(plan.menuApprovedAt)})` : ""}. Any change to
            a meal or to resident requirements reopens it for revalidation. Purchase orders are
            approved separately.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-1 text-sm font-semibold">Preparation summary</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                <li>
                  {planned} of {TOTAL_MEALS} meals planned across 7 days
                </li>
                <li>
                  {menu.residentsCovered} of {menu.residentsTotal} residents covered in every meal
                </li>
                {approvedRevisions.map((e) => (
                  <li key={e.eventId}>{e.summary}</li>
                ))}
              </ul>
            </div>
            <PurchasingTasks purchase={purchase} />
          </div>
        </>
      ) : running ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 animate-pulse" />
          The agents are still working. Decisions will appear here when the run pauses for your
          review.
        </p>
      ) : (
        <div className={cn("grid gap-4", pendingRevs.length > 0 && "lg:grid-cols-[1fr_1fr]")}>
          {pendingRevs.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                Pending substitutions ({pendingRevs.length})
              </h3>
              {pendingRevs.map((rev) => (
                <RevisionDecision key={rev.eventId} revision={rev} events={events} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pending substitutions (0): no menu revisions are waiting for a decision.
            </p>
          )}
          <div className={cn("grid gap-3", pendingRevs.length === 0 && "md:grid-cols-2")}>
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Weekly menu approval</h3>
              {revalidationCount > 0 && (
                <p className="mt-1 flex items-center gap-1 text-sm text-warning">
                  <TriangleAlert className="size-4" />
                  {revalidationCount} meals changed after the last approval and are being rechecked.
                </p>
              )}
              {checks.ready ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  All 21 meals are planned, every resident has an approved safe meal, and every
                  revision is decided. The week is ready for your approval.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Resolve these before approving the week:
                  </p>
                  <ul aria-label="Approval blockers" className="mt-1 space-y-0.5 text-sm">
                    {checks.blockers.map((b) => (
                      <li key={b.code} className="flex items-start gap-1.5">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                        <span>
                          {b.message}
                          {b.link && (
                            <>
                              {" "}
                              <Link
                                to={b.link}
                                className="font-medium text-primary underline-offset-2 hover:underline"
                              >
                                Review
                              </Link>
                            </>
                          )}
                          {b.observationIds && (
                            <ul className="mt-1 space-y-1">
                              {b.observationIds.map((id) => {
                                const o = state.observations?.find((x) => x.id === id);
                                if (!o) return null;
                                const resident = state.residents.find((r) => r.id === o.residentId);
                                return (
                                  <li key={id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
                                    <span className="min-w-0 flex-1">
                                      <span className="font-semibold">{resident?.name ?? o.residentId}</span>
                                      {" · "}{dishById(o.dishId)?.name ?? o.dishId}{" · "}{o.reaction}
                                    </span>
                                    <Button variant="outline" size="sm" className="h-7" onClick={() => dispatch({ type: "reviewObservation", id })}>
                                      Mark reviewed
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {pendingAlternatives > 0 && checks.ready === false && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Resident alternatives are approved per resident in the Approval Center.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                A passed automated check does not replace required clinical or professional review
                of therapeutic diets.
              </p>
              <Button
                className="mt-3"
                size="lg"
                disabled={!checks.ready}
                onClick={() => dispatch({ type: "approveWeeklyMenu", id: weekId })}
              >
                <ClipboardCheck className="size-4" />
                Approve Weekly Menu
              </Button>
            </div>
            <PurchasingTasks purchase={purchase} count={checks.purchasingTasks} />
          </div>
        </div>
      )}
    </section>
  );
}

function PurchasingTasks({
  purchase,
  count,
}: {
  purchase: AgentEvent | undefined;
  count?: number;
}) {
  const lines =
    purchase?.structuredPayload.kind === "purchase" ? purchase.structuredPayload.lines : [];
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">
        Purchasing tasks{count !== undefined ? ` (${count})` : ""}
      </h3>
      {lines.length ? (
        <>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {lines.slice(0, 6).map((l) => (
              <li key={l.ingredientId}>
                {l.name} — {l.qty} {l.unit} ({l.vendor})
              </li>
            ))}
            {lines.length > 6 && <li>…and {lines.length - 6} more</li>}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Draft only — no order has been placed. Purchasing doesn't block menu approval and is
            approved separately.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No shortages were found, so no purchases are recommended.
        </p>
      )}
    </div>
  );
}

function SummaryLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

function AgentCard({
  id,
  activity,
  latest,
  summary,
  duty,
  waitingOn,
}: {
  id: AgentId;
  activity: AgentActivity;
  latest: AgentEvent | undefined;
  summary: string;
  duty: string;
  waitingOn: string | null;
}) {
  const info = AGENT_INFO[id];
  const a = ACTIVITY_LABEL[activity];
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: id }}
      aria-label={`View ${info.name} profile`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <article className="flex h-full flex-col rounded-xl border bg-card p-5 shadow-soft transition-colors group-hover:border-primary">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <AgentAvatar agent={id} />
            {info.name}
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", a.badge)}>
            {a.label}
          </span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current responsibility
            </dt>
            <dd>{duty}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Waiting on
            </dt>
            <dd className={cn(waitingOn === "Kitchen Manager" && "font-medium text-warning")}>
              {waitingOn ?? "Nobody"}
            </dd>
          </div>
        </dl>
        <div className="mt-3 rounded-lg bg-muted/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Most recent action
          </p>
          {latest ? (
            <>
              <p className="mt-0.5 text-sm font-medium">
                {ACTION_LABEL[latest.action]}{" "}
                <span className="font-normal text-muted-foreground">
                  ·{" "}
                  {new Date(latest.timestamp).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </p>
              <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{latest.summary}</p>
            </>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">No actions yet for this week.</p>
          )}
        </div>
      </article>
    </Link>
  );
}

function HandoffDetails({
  handoff,
  events,
  run,
}: {
  handoff: AgentEvent;
  events: AgentEvent[];
  run: WorkflowRun | undefined;
}) {
  const style = HANDOFF_STYLE[handoff.status];
  const time = new Date(handoff.timestamp);
  const ingredients = affectedIngredients(handoff, events);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {PARTY_LABEL[handoff.sendingAgent]}{" "}
          <ArrowRight className="size-3.5 text-muted-foreground" />{" "}
          {PARTY_LABEL[handoff.receivingAgent]}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              style.badge,
            )}
          >
            <style.icon className="size-3" />
            {style.label}
          </span>
          <time dateTime={time.toISOString()}>
            {time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </time>
        </span>
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Sending agent</dt>
          <dd className="font-medium">{PARTY_LABEL[handoff.sendingAgent]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Receiving agent</dt>
          <dd className="font-medium">{PARTY_LABEL[handoff.receivingAgent]}</dd>
        </div>
      </dl>
      <div className="space-y-3 text-sm">
        <SummaryLine label={ACTION_LABEL[handoff.action]}>
          <p>{handoff.summary}</p>
        </SummaryLine>
        <SummaryLine label="Reason for handoff">
          <p>{handoffReason(handoff)}</p>
        </SummaryLine>
        <SummaryLine label="Information exchanged">
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {handoff.structuredPayload.facts.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </SummaryLine>
        <SummaryLine label="Agent response">
          <p>{handoffResponse(handoff, events, run)}</p>
        </SummaryLine>
        <SummaryLine label="Affected meal or ingredient">
          <p>
            {handoff.affectedDate && handoff.affectedMeal
              ? `${shortDate(handoff.affectedDate)} ${handoff.affectedMeal}`
              : "Whole week"}
            {ingredients.length
              ? ` · ${ingredients.slice(0, 4).join(", ")}${ingredients.length > 4 ? ` +${ingredients.length - 4} more` : ""}`
              : ""}
          </p>
        </SummaryLine>
        <SummaryLine label="Impact on weekly plan">
          <p>{handoff.result}</p>
        </SummaryLine>
        {handoff.affectedDate && handoff.affectedMeal && (
          <Button size="sm" variant="outline" asChild>
            <Link
              to="/menu/$date"
              params={{ date: handoff.affectedDate }}
              search={{ meal: handoff.affectedMeal, focus: true }}
            >
              View Affected Meal <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function RevisionDecision({ revision, events }: { revision: AgentEvent; events: AgentEvent[] }) {
  const { dispatch } = useKitchen();
  if (revision.structuredPayload.kind !== "revision") return null;
  const p = revision.structuredPayload.proposal;
  const shortage = events.find(
    (e) =>
      e.structuredPayload.kind === "shortage" &&
      e.structuredPayload.finding.ingredientId === p.ingredientId,
  );
  const finding =
    shortage?.structuredPayload.kind === "shortage"
      ? shortage.structuredPayload.finding
      : undefined;
  const checks = events.filter(
    (e) =>
      e.structuredPayload.kind === "revalidation" &&
      e.structuredPayload.proposalEventId === revision.eventId,
  );
  const day = parseDateKey(p.date)?.toLocaleDateString("en-US", { weekday: "long" }) ?? p.date;
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-semibold">
        {day} {mealLabel(p.meal)} — Substitution Requested
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Original</dt>
          <dd>{p.fromDishName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Proposed</dt>
          <dd className="font-medium">{p.toDishName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Reason</dt>
          <dd className="text-muted-foreground">
            {finding
              ? `Insufficient ${finding.name.toLowerCase()}: week needs ${finding.weekRequirement} ${finding.unit}, short ${finding.shortfall} ${finding.unit}.`
              : `Avoids the ${p.ingredientName.toLowerCase()} shortage.`}
          </dd>
        </div>
      </dl>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {checks.map((c) => (
          <li key={c.eventId} className="flex items-center gap-1">
            {c.structuredPayload.kind === "revalidation" && c.structuredPayload.passed ? (
              <Check className="size-3 text-success" />
            ) : (
              <TriangleAlert className="size-3 text-warning" />
            )}
            {c.result}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <CircleAlert className="size-3 text-warning" />
          Staff review required
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            dispatch({
              type: "decideWeeklyRevision",
              eventId: revision.eventId,
              decision: "approve",
            })
          }
        >
          Approve Substitution
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            dispatch({ type: "requestAnotherWeeklyRevision", eventId: revision.eventId })
          }
        >
          Request Another Option
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            dispatch({
              type: "decideWeeklyRevision",
              eventId: revision.eventId,
              decision: "decline",
            })
          }
        >
          Keep Original
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/menu/$date" params={{ date: p.date }} search={{ meal: p.meal, focus: true }}>
            View Meal Details
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MealCellDetails({
  state,
  slot,
  status,
  events,
  checked,
}: {
  state: KitchenState;
  slot: WeeklyMenuSlot;
  status: CellStatus;
  events: AgentEvent[];
  checked: boolean;
}) {
  const day =
    parseDateKey(slot.date)?.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) ?? slot.date;
  const dish = dishById(slot.dishId);
  const ingredientNames = (dish?.ingredients ?? []).map(
    (i) => state.ingredients.find((x) => x.id === i.id)?.name ?? i.id,
  );
  const shortages = events.flatMap((e) =>
    e.structuredPayload.kind === "shortage" &&
    e.structuredPayload.slots.some((x) => x.date === slot.date && x.meal === slot.meal)
      ? [e.structuredPayload.finding.name]
      : [],
  );
  const toPurchase = events
    .flatMap((e) =>
      e.structuredPayload.kind === "purchasable-shortages" ? e.structuredPayload.findings : [],
    )
    .filter((f) => dish?.ingredients.some((i) => i.id === f.ingredientId))
    .map((f) => f.name);
  const pendingRevision = events.find(
    (e) =>
      e.structuredPayload.kind === "revision" &&
      e.affectedDate === slot.date &&
      e.affectedMeal === slot.meal &&
      !events.some(
        (d) =>
          d.structuredPayload.kind === "decision" &&
          d.structuredPayload.proposalEventId === e.eventId,
      ),
  );
  const approvedRevision = events.find(
    (e) =>
      e.action === "approve-revision" &&
      e.affectedDate === slot.date &&
      e.affectedMeal === slot.meal,
  );
  const alternatives = Object.values(slot.overrides).reduce<Record<string, number>>(
    (acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }),
    {},
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {day} {mealLabel(slot.meal)} — {status === "unplanned" ? "Not planned" : slot.dishName}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {status === "unplanned" ? (
          <p className="text-muted-foreground">
            This meal has not been planned yet. Generate the weekly plan to fill all 21 slots.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">Recipe</span>
              <span className="font-medium">{slot.dishName}</span>
            </div>
            {dish && (
              <div className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">Description</span>
                <span>{dish.description}</span>
              </div>
            )}
            {ingredientNames.length > 0 && (
              <div className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">Ingredients</span>
                <span>{ingredientNames.join(", ")}</span>
              </div>
            )}
            {dish && dish.allergens.length > 0 && (
              <div className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">Allergens</span>
                <span>{dish.allergens.join(", ")}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">Status</span>
              <span>
                {CELL_LABEL[status]}
                {slot.source === "rotation" ? " · from the sample rotation (past day)" : ""}
              </span>
            </div>
            {approvedRevision && (
              <div className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">Revision</span>
                <span>{approvedRevision.summary}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">Alternatives</span>
              <span>
                {Object.keys(alternatives).length
                  ? Object.entries(alternatives)
                      .map(([id, n]) => `${dishById(id)?.name ?? id} (${n})`)
                      .join(", ")
                  : slot.pendingAlternatives
                    ? "Proposed alternatives awaiting approval"
                    : "None needed"}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">Dietary check</span>
              {slot.unresolved > 0 ? (
                <span className="flex items-center gap-1 text-warning">
                  <TriangleAlert className="size-3.5" />
                  {slot.unresolved} residents without a safe option
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="size-3.5 text-success" />
                  {slot.residentsSafe} of {state.residents.length} safe now
                  {slot.pendingAlternatives
                    ? ` · ${slot.pendingAlternatives} alternatives pending approval`
                    : ""}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">Inventory check</span>
              {!checked ? (
                <span className="text-muted-foreground">Not checked yet</span>
              ) : shortages.length ? (
                <span className="flex items-center gap-1 text-warning">
                  <TriangleAlert className="size-3.5" />
                  Can't be supplied in time — {shortages.join(", ").toLowerCase()}
                </span>
              ) : toPurchase.length ? (
                <span className="flex items-center gap-1">
                  <Check className="size-3.5 text-success" />
                  Covered once purchasing arrives ({toPurchase.join(", ").toLowerCase()})
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="size-3.5 text-success" />
                  Covered by projected stock
                </span>
              )}
            </div>
            {slot.needsRevalidation && (
              <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">
                Changed after the week was approved. Checks are rerun live above; the week needs
                your renewed approval.
              </p>
            )}
            {pendingRevision && (
              <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">
                Pending manager decision: {pendingRevision.summary}
              </p>
            )}
            {status === "approved" && (
              <p className="rounded-lg bg-success-soft p-2 text-xs text-success">
                Approved by the kitchen manager.
              </p>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/menu/$date"
                params={{ date: slot.date }}
                search={{ meal: slot.meal, focus: true }}
              >
                Open in Daily Menu <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </>
  );
}

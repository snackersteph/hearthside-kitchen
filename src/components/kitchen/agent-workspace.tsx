import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert,
  ClipboardCheck, Clock, Minus, Sparkles, TriangleAlert, UserCheck, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar } from "@/components/kitchen/agents";
import { dishById } from "@/lib/kitchen/data";
import { useKitchen, useWeeklyMenu } from "@/lib/kitchen/store";
import type { Meal } from "@/lib/kitchen/types";
import {
  WORKFLOW_STEPS, WORKFLOW_STEP_LABELS, agentActivity, canStartWeeklyWorkflow, latestRunFor, pendingRevisions,
  residentConstraints, runEvents, weekApprovalBlock,
  type AgentAction, type AgentActivity, type AgentEvent, type AgentEventStatus, type AgentParty, type WorkflowRun,
} from "@/lib/kitchen/agent-workflow";
import type { WeeklyMenuSlot } from "@/lib/kitchen/weekly-menu";
import { addDays, parseDateKey, phaseFor, weekStartFor, weeklyPlanId, type WeeklyMenuStatus, type WeeklyPhase } from "@/lib/kitchen/weekly-schedule";
import { dateKey } from "@/lib/kitchen/schedule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AGENT_INFO, AGENT_ORDER, MEAL_ROWS, STAGE_INFO, TOTAL_MEALS, WEEK_DAYS, type AgentId } from "@/lib/kitchen/weekly-plan";

type CellStatus = "unplanned" | "passed" | "review" | "approved";

const HANDOFF_STYLE: Record<AgentEventStatus, { icon: LucideIcon; label: string; badge: string }> = {
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

const PARTY_LABEL: Record<AgentParty, string> = {
  dietary: "Dietary Agent", menu: "Menu Agent", inventory: "Inventory Agent", team: "AI Team", manager: "Kitchen Manager",
};

const ACTION_LABEL: Record<AgentAction, string> = {
  "share-dietary-constraints": "Shared dietary constraints",
  "send-ingredient-requirements": "Sent ingredient requirements",
  "report-shortage": "Reported a shortage",
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
};

const CELL_STYLE: Record<CellStatus, string> = {
  unplanned: "bg-muted text-muted-foreground",
  passed: "bg-success-soft text-success",
  review: "bg-warning-soft text-warning",
  approved: "bg-success text-success-foreground",
};

const CELL_ICON: Record<CellStatus, LucideIcon> = {
  unplanned: Minus,
  passed: Check,
  review: TriangleAlert,
  approved: CheckCircle2,
};

const START_REFUSAL: Record<string, string> = {
  "week-ended": "This service week has ended, so its menu can no longer be generated.",
  "week-approved": "This week's menu is approved. Changes now require an explicit revision from the Daily Menu.",
};

function weekRangeLabel(start: string) {
  const a = parseDateKey(start)!;
  const b = parseDateKey(addDays(start, 6))!;
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
    : `${month(a)} ${a.getDate()}${a.getFullYear() !== b.getFullYear() ? `, ${a.getFullYear()}` : ""}–${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

const isPlanned = (slot: WeeklyMenuSlot) => slot.source === "saved" || slot.lock === "past";
const slotKey = (date: string | null, meal: Meal | null) => `${date}|${meal}`;
const worst = (events: AgentEvent[]): AgentEventStatus =>
  events.some((e) => e.status === "warning") ? "warning" : events.some((e) => e.status === "pending") ? "pending" : "completed";

export function AgentWorkspace() {
  const { state, dispatch, reference } = useKitchen();
  const today = dateKey(reference);
  const selectedPlan = state.weeklyPlans?.find((p) => p.id === state.selectedWeekId);
  // Default to the week now in its planning phase (two weeks out).
  const [weekStart, setWeekStart] = useState(() => selectedPlan?.startDate ?? addDays(weekStartFor(today), 14));
  const weekId = weeklyPlanId(weekStart);
  const plan = state.weeklyPlans?.find((p) => p.id === weekId);
  const menu = useWeeklyMenu(weekStart)!;
  const run = latestRunFor(state, weekId);
  const activeRun = run && run.status !== "superseded" ? run : undefined;
  const events = useMemo(() => (activeRun ? runEvents(state, activeRun.workflowRunId) : []), [state, activeRun]);
  const [selectedHandoff, setSelectedHandoff] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ day: number; meal: number } | null>(null);

  const changeWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelectedHandoff(null);
    if (state.weeklyPlans?.some((p) => p.id === weeklyPlanId(next))) dispatch({ type: "selectServiceWeek", id: weeklyPlanId(next) });
  };

  const running = activeRun?.status === "running";
  const awaiting = activeRun?.status === "awaiting-approval";
  const status: WeeklyMenuStatus = running ? "generating" : plan?.menuStatus ?? "not-started";
  const refusal = canStartWeeklyWorkflow(state, weekStart, reference);
  const phase = phaseFor(weekStart, reference);

  const pendingRevs = activeRun ? pendingRevisions(state, activeRun.workflowRunId) : [];
  const pendingRevKeys = new Set(pendingRevs.map((e) => slotKey(e.affectedDate, e.affectedMeal)));
  // "shortage" events are real conflicts (can't be delivered in time); the rest go to purchasing.
  const shortageEvents = events.filter((e) => e.structuredPayload.kind === "shortage");
  const purchasableCount = events.reduce((n, e) => n + (e.structuredPayload.kind === "purchasable-shortages" ? e.structuredPayload.findings.length : 0), 0);
  const purchase = events.find((e) => e.structuredPayload.kind === "purchase");
  const approvedRevisions = events.filter((e) => e.action === "approve-revision");
  const planned = menu.slots.filter(isPlanned).length;
  const pendingAlternatives = menu.slots.reduce((n, x) => n + x.pendingAlternatives, 0);
  const dietaryIssueSlots = menu.slots.filter((x) => x.unresolved > 0).length;
  const issues = shortageEvents.length + dietaryIssueSlots;
  const pendingApprovals = pendingRevs.length + pendingAlternatives;
  const approvalBlock = weekApprovalBlock(state, weekId);
  const weekApproved = plan?.menuStatus === "approved";

  const constraints = residentConstraints(state);
  const activities = agentActivity(activeRun);
  const agentSummaries: Record<AgentId, string> = {
    dietary: `${constraints.restricted} of ${state.residents.length} residents have dietary restrictions affecting this week`,
    menu: `${planned} of ${TOTAL_MEALS} meals planned · ${pendingAlternatives} resident alternatives awaiting approval`,
    inventory: activeRun && activeRun.step >= 3
      ? `Found ${purchasableCount + shortageEvents.length} ingredients to purchase for this week, ${shortageEvents.length} of which can't arrive in time`
      : "Stock not yet checked for this week",
  };

  const handoff = events.find((e) => e.eventId === selectedHandoff) ?? events.find((e) => e.status === "warning") ?? events.at(-1);

  const cellStatusOf = (slot: WeeklyMenuSlot): CellStatus => {
    if (!isPlanned(slot)) return "unplanned";
    if (weekApproved || slot.approved) return "approved";
    if (pendingRevKeys.has(slotKey(slot.date, slot.meal)) || slot.unresolved > 0 || slot.pendingAlternatives > 0) return "review";
    return "passed";
  };

  return (
    <>
      <PageHeader eyebrow="Agents" title="Agent Workspace" />
      <p className="-mt-4 mb-1 text-muted-foreground">See how your AI team collaborates to plan meals for the week.</p>
      <p className="mb-6 text-xs text-muted-foreground">
        The agents are rule-based: each step runs NutriSync's deterministic dietary, menu and inventory checks on this week's residents, recipes, stock and orders. No AI model is called.
      </p>

      {/* Weekly planning controls */}
      <section aria-label="Weekly planning controls" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => changeWeek(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-52 text-center">
            <p className="font-semibold">{weekRangeLabel(weekStart)}</p>
            <p className="text-xs text-muted-foreground">{PHASE_LABEL[phase]} · {WEEKLY_STATUS_LABEL[status]}</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => changeWeek(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold",
            status === "approved" ? "bg-success-soft text-success"
            : status === "needs-review" ? "bg-warning-soft text-warning"
            : status === "generating" ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground")}>
            {WEEKLY_STATUS_LABEL[status]}
          </span>
          <Button onClick={() => dispatch({ type: "startWeeklyWorkflow", date: weekStart })} disabled={refusal !== null}>
            <Sparkles className="size-4" />
            {running ? `Generating… step ${Math.min(activeRun.step + 1, WORKFLOW_STEPS)} of ${WORKFLOW_STEPS}` : awaiting ? "Regenerate Weekly Plan" : "Generate Weekly Plan"}
          </Button>
        </div>
      </section>

      {refusal && START_REFUSAL[refusal] && (
        <p className="mb-8 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{START_REFUSAL[refusal]}</p>
      )}
      {activeRun?.status === "stopped" && (
        <p className="mb-8 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">The last run stopped: {activeRun.stopReason}</p>
      )}

      {/* Summary cards */}
      <section aria-label="Weekly summary" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Meals Planned" value={`${planned} / ${TOTAL_MEALS}`} sub="Breakfast, lunch, dinner × 7 days" />
        <SummaryCard label="Residents Covered" value={`${menu.residentsCovered} / ${menu.residentsTotal}`} sub="Safe served or proposed dish in every meal" />
        <SummaryCard label="Issues Identified" value={String(issues)} sub={`${shortageEvents.length} inventory conflicts · ${dietaryIssueSlots} dietary`} tone={issues > 0 ? "warn" : "ok"} />
        <SummaryCard label="Pending Approvals" value={String(pendingApprovals)} sub={`${pendingRevs.length} menu revisions · ${pendingAlternatives} resident alternatives`} tone={pendingApprovals > 0 ? "warn" : "ok"} />
      </section>

      {/* Agent overview */}
      <section aria-label="AI team overview" className="mb-8 grid gap-3 md:grid-cols-3">
        {AGENT_ORDER.map((id) => (
          <AgentCard key={id} id={id} activity={activities[id]} run={activeRun} latest={events.filter((e) => e.sendingAgent === id).at(-1)} summary={agentSummaries[id]} />
        ))}
      </section>

      {/* Weekly meal coverage matrix */}
      <section aria-label="Weekly meal coverage" className="mb-8 rounded-xl border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Weekly meal coverage</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-muted" />Not planned</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success-soft" />Checks passed</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-warning-soft" />Needs review</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success" />Approved</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-1 text-left text-xs font-medium text-muted-foreground">Meal</th>
                {WEEK_DAYS.map((d) => <th key={d} className="p-1 text-center text-xs font-medium text-muted-foreground">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {MEAL_ROWS.map((meal, mealIdx) => (
                <tr key={meal}>
                  <th className="p-1 text-left text-xs font-semibold">{meal}</th>
                  {menu.days.map((day, dayIdx) => {
                    const slot = day.slots[mealIdx]!;
                    const status = cellStatusOf(slot);
                    const Icon = CELL_ICON[status];
                    return (
                      <td key={day.date} className="p-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCell({ day: dayIdx, meal: mealIdx })}
                          aria-label={`${WEEK_DAYS[dayIdx]} ${meal}: ${isPlanned(slot) ? slot.dishName : "not planned"} (${status})`}
                          className={cn("flex h-9 w-full items-center justify-center rounded-md transition-transform hover:scale-105", CELL_STYLE[status])}>
                          <Icon className="size-4" />
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

      {/* Main workspace: collaboration flow + handoff details */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[65fr_35fr]">
        <section aria-label="Collaboration flow">
          <h2 className="mb-4 text-lg font-semibold">Collaboration Flow</h2>
          {!activeRun ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No collaboration yet for this week. Generate the weekly plan to run the agents through five stages,
              from dietary analysis to your approval.
            </p>
          ) : (
            <ol className="space-y-4">
              {STAGE_INFO.map((stage) => {
                const stageEvents = events.filter((e) => e.stage === stage.id);
                if (!stageEvents.length) return null;
                const stageStatus = worst(stageEvents);
                const style = HANDOFF_STYLE[stageStatus];
                const bullets = [...new Set(stageEvents.flatMap((e) => e.structuredPayload.facts))].slice(0, 4);
                return (
                  <li key={stage.id} className="rounded-xl border bg-card p-5 shadow-soft">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Stage {stage.id} — {stage.title}</h3>
                      <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", style.badge)}>
                        <style.icon className="size-3.5" />{STAGE_STATUS_LABEL[stageStatus]}
                      </span>
                    </div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{stage.agents}</p>
                    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {bullets.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                    <div className="space-y-2">
                      {stageEvents.map((h) => {
                        const hs = HANDOFF_STYLE[h.status];
                        const active = handoff?.eventId === h.eventId;
                        return (
                          <button key={h.eventId} type="button" onClick={() => setSelectedHandoff(h.eventId)}
                            className={cn("w-full rounded-lg border p-3 text-left transition-colors hover:border-primary",
                              active && "border-primary ring-1 ring-primary")}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold">
                                {PARTY_LABEL[h.sendingAgent]} <ArrowRight className="size-3 text-muted-foreground" /> {PARTY_LABEL[h.receivingAgent]}
                              </span>
                              <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", hs.badge)}>
                                <hs.icon className="size-3" />{hs.label}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{h.summary}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-sm"><span className="font-medium">Outcome:</span> <span className="text-muted-foreground">{stageEvents.at(-1)!.result}</span></p>
                  </li>
                );
              })}
              {running && (
                <li className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <Clock className="size-4 animate-pulse" /> Running step {Math.min(activeRun.step + 1, WORKFLOW_STEPS)} of {WORKFLOW_STEPS}: {WORKFLOW_STEP_LABELS[Math.min(activeRun.step, WORKFLOW_STEPS - 1)]}…
                </li>
              )}
            </ol>
          )}
        </section>

        <aside aria-label="Handoff details and manager decisions" className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {awaiting && pendingRevs.length > 0 && (
            <section aria-label="Manager decisions" className="rounded-xl border border-warning bg-card p-5 shadow-soft">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <UserCheck className="size-5 text-warning" />Manager Decisions
              </h2>
              <div className="space-y-4">
                {pendingRevs.map((rev) => <RevisionDecision key={rev.eventId} revision={rev} events={events} />)}
              </div>
            </section>
          )}

          <section aria-label="Handoff details" className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 text-lg font-semibold">Handoff Details</h2>
            {handoff ? (
              <HandoffDetails handoff={handoff} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a handoff in the collaboration flow to inspect what the agents exchanged.</p>
            )}
          </section>
        </aside>
      </div>

      {/* Final weekly approval */}
      {(weekApproved || (activeRun && activeRun.status !== "running")) && (
        <section aria-label="Weekly approval" className={cn("rounded-xl border p-5 shadow-soft", weekApproved ? "border-success bg-success-soft/40" : "bg-card")}>
          {weekApproved ? (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 text-success" />Weekly Menu Approved</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The {TOTAL_MEALS}-meal plan for {weekRangeLabel(weekStart)} is recorded in the daily menu. Changes now require an explicit revision.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-1 text-sm font-semibold">Preparation summary</h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    <li>{planned} of {TOTAL_MEALS} meals planned across 7 days</li>
                    <li>{menu.residentsCovered} of {menu.residentsTotal} residents covered in every meal</li>
                    {approvedRevisions.map((e) => <li key={e.eventId}>{e.summary}</li>)}
                    {pendingAlternatives > 0 && <li>{pendingAlternatives} resident alternatives still awaiting approval</li>}
                  </ul>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-1 text-sm font-semibold">Draft purchasing list</h3>
                  {purchase?.structuredPayload.kind === "purchase" ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                      {purchase.structuredPayload.lines.map((l) => <li key={l.ingredientId}>{l.name} — {l.qty} {l.unit} ({l.vendor})</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No shortages were found, so no purchases are recommended.</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Draft only — no order has been placed.</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Final weekly approval</h2>
                <p className="text-sm text-muted-foreground">
                  {approvalBlock === "pending-revisions"
                    ? `Decide the ${pendingRevs.length} pending menu revision${pendingRevs.length > 1 ? "s" : ""} above before approving the week.`
                    : approvalBlock === "no-review"
                      ? "Generate the weekly plan to run the agent checks before approving."
                      : `All agent checks have run and every revision is decided.${pendingAlternatives ? ` ${pendingAlternatives} resident alternatives are still awaiting approval in the Approval Center.` : ""}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">A passed automated check does not replace required clinical or professional review of therapeutic diets.</p>
              </div>
              <Button size="lg" disabled={approvalBlock !== null} onClick={() => dispatch({ type: "approveWeeklyMenu", id: weekId })}>
                <ClipboardCheck className="size-4" />Approve Weekly Menu
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Meal cell details */}
      <Dialog open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent className="max-w-md">
          {selectedCell && (
            <MealCellDetails
              slot={menu.days[selectedCell.day]!.slots[selectedCell.meal]!}
              status={cellStatusOf(menu.days[selectedCell.day]!.slots[selectedCell.meal]!)}
              events={events}
              checked={!!activeRun && activeRun.step >= 3}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "warn" && "text-warning", tone === "ok" && "text-success")}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function AgentCard({ id, activity, run, latest, summary }: { id: AgentId; activity: AgentActivity; run: WorkflowRun | undefined; latest: AgentEvent | undefined; summary: string }) {
  const info = AGENT_INFO[id];
  const a = ACTIVITY_LABEL[activity];
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: id }}
      aria-label={`View ${info.name} profile`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <article className="h-full rounded-xl border bg-card p-5 shadow-soft transition-colors group-hover:border-primary">
        <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <AgentAvatar agent={id} />
          {info.name}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", a.badge)}>{a.label}</span>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
      {run ? (
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-sm font-medium">{latest ? `${a.label} — ${ACTION_LABEL[latest.action]}` : activity === "idle" ? "Waiting to start" : a.label}</p>
          {latest && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{latest.summary}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Idle until the weekly plan is generated.</p>
      )}
      </article>
    </Link>
  );
}

function HandoffDetails({ handoff }: { handoff: AgentEvent }) {
  const style = HANDOFF_STYLE[handoff.status];
  const time = new Date(handoff.timestamp);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {PARTY_LABEL[handoff.sendingAgent]} <ArrowRight className="size-3.5 text-muted-foreground" /> {PARTY_LABEL[handoff.receivingAgent]}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", style.badge)}>
            <style.icon className="size-3" />{style.label}
          </span>
          <time dateTime={time.toISOString()}>{time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
        </span>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ACTION_LABEL[handoff.action]}</h3>
          <p>{handoff.summary}</p>
        </div>
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Information shared</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {handoff.structuredPayload.facts.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</h3>
          <p>{handoff.result}</p>
        </div>
        {handoff.affectedDate && handoff.affectedMeal && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/menu/$date" params={{ date: handoff.affectedDate }} search={{ meal: handoff.affectedMeal, focus: true }}>
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
  const shortage = events.find((e) => e.structuredPayload.kind === "shortage" && e.structuredPayload.finding.ingredientId === p.ingredientId);
  const finding = shortage?.structuredPayload.kind === "shortage" ? shortage.structuredPayload.finding : undefined;
  const checks = events.filter((e) => e.structuredPayload.kind === "revalidation" && e.structuredPayload.proposalEventId === revision.eventId);
  const day = parseDateKey(p.date)?.toLocaleDateString("en-US", { weekday: "long" }) ?? p.date;
  return (
    <div className="rounded-lg border p-4">
      <p className="font-semibold">{day} {p.meal[0]!.toUpperCase()}{p.meal.slice(1)} — Substitution Requested</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Original</dt><dd>{p.fromDishName}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Proposed</dt><dd className="font-medium">{p.toDishName}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Reason</dt><dd className="text-muted-foreground">
          {finding ? `Insufficient ${finding.name.toLowerCase()}: week needs ${finding.weekRequirement} ${finding.unit}, short ${finding.shortfall} ${finding.unit}.` : `Avoids the ${p.ingredientName.toLowerCase()} shortage.`}
        </dd></div>
      </dl>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {checks.map((c) => (
          <li key={c.eventId} className="flex items-center gap-1">
            {c.structuredPayload.kind === "revalidation" && c.structuredPayload.passed
              ? <Check className="size-3 text-success" />
              : <TriangleAlert className="size-3 text-warning" />}
            {c.result}
          </li>
        ))}
        <li className="flex items-center gap-1"><CircleAlert className="size-3 text-warning" />Staff review required</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => dispatch({ type: "decideWeeklyRevision", eventId: revision.eventId, decision: "approve" })}>Approve Substitution</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: "requestAnotherWeeklyRevision", eventId: revision.eventId })}>Request Another Option</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: "decideWeeklyRevision", eventId: revision.eventId, decision: "decline" })}>Keep Original</Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/menu/$date" params={{ date: p.date }} search={{ meal: p.meal, focus: true }}>View Meal Details</Link>
        </Button>
      </div>
    </div>
  );
}

function MealCellDetails({ slot, status, events, checked }: { slot: WeeklyMenuSlot; status: CellStatus; events: AgentEvent[]; checked: boolean }) {
  const day = parseDateKey(slot.date)?.toLocaleDateString("en-US", { weekday: "short" }) ?? slot.date;
  const mealLabel = `${slot.meal[0]!.toUpperCase()}${slot.meal.slice(1)}`;
  const shortages = events.flatMap((e) => (e.structuredPayload.kind === "shortage" && e.structuredPayload.slots.some((x) => x.date === slot.date && x.meal === slot.meal) ? [e.structuredPayload.finding.name] : []));
  const pendingRevision = events.find((e) => e.structuredPayload.kind === "revision" && e.affectedDate === slot.date && e.affectedMeal === slot.meal
    && !events.some((d) => d.structuredPayload.kind === "decision" && d.structuredPayload.proposalEventId === e.eventId));
  const approvedRevision = events.find((e) => e.action === "approve-revision" && e.affectedDate === slot.date && e.affectedMeal === slot.meal);
  const alternatives = Object.values(slot.overrides).reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});
  return (
    <>
      <DialogHeader>
        <DialogTitle>{day} {mealLabel} — {status === "unplanned" ? "Not planned" : slot.dishName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {status === "unplanned" ? (
          <p className="text-muted-foreground">This meal has not been planned yet. Generate the weekly plan to fill all 21 slots.</p>
        ) : (
          <>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Recipe</span><span className="font-medium">{slot.dishName}</span></div>
            {approvedRevision?.structuredPayload.kind === "decision" && (
              <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Revision</span><span>{approvedRevision.summary}</span></div>
            )}
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Alternatives</span>
              <span>{Object.keys(alternatives).length
                ? Object.entries(alternatives).map(([id, n]) => `${dishById(id)?.name ?? id} (${n})`).join(", ")
                : slot.pendingAlternatives ? "Proposed alternatives awaiting approval" : "None needed"}</span>
            </div>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Dietary check</span>
              {slot.unresolved > 0
                ? <span className="flex items-center gap-1 text-warning"><TriangleAlert className="size-3.5" />{slot.unresolved} residents without a safe option</span>
                : <span className="flex items-center gap-1"><Check className="size-3.5 text-success" />Passed{slot.pendingAlternatives ? ` — ${slot.pendingAlternatives} alternatives pending approval` : ""}</span>}
            </div>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Inventory check</span>
              {!checked
                ? <span className="text-muted-foreground">Not checked yet</span>
                : shortages.length
                  ? <span className="flex items-center gap-1 text-warning"><TriangleAlert className="size-3.5" />Shortage — {shortages.join(", ").toLowerCase()}</span>
                  : <span className="flex items-center gap-1"><Check className="size-3.5 text-success" />Passed</span>}
            </div>
            {pendingRevision && (
              <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">Pending manager decision: {pendingRevision.summary}</p>
            )}
            {status === "approved" && (
              <p className="rounded-lg bg-success-soft p-2 text-xs text-success">Approved by the kitchen manager.</p>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to="/menu/$date" params={{ date: slot.date }} search={{ meal: slot.meal, focus: true }}>
                Open in Daily Menu <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </>
  );
}

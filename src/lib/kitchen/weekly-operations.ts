import type { Analysis } from "./engine";
import { dateKey } from "./schedule";
import type { KitchenState } from "./types";
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  latestRunFor,
  pendingRevisions,
  weeklyApprovalChecks,
  type WorkflowRun,
} from "./agent-workflow";
import { weeklyMenu } from "./weekly-menu";
import { weeklyPurchasePlan } from "./weekly-purchasing";
import {
  DEFAULT_LEAD_TIME_DAYS,
  addDays,
  lifecycleDates,
  parseDateKey,
  phaseFor,
  weekStartFor,
  weeklyPlanId,
  type WeeklyPhase,
  type WeeklyPlan,
} from "./weekly-schedule";

// One derived status per Monday–Sunday service week, shared by the menu calendar,
// Kitchen Pulse and the Agent Workspace. It combines the calendar phase (a date fact)
// with recorded staff decisions; a deadline passing never advances a week. Unfinished
// work past its deadline stays at its real status and is reported as an outstanding action.

export type WeekStatus =
  | "not-started"
  | "planning"
  | "needs-review"
  | "menu-approved"
  | "purchasing"
  | "ready-for-service"
  | "in-service"
  | "completed";

export const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  "not-started": "Not Started",
  planning: "Planning",
  "needs-review": "Needs Review",
  "menu-approved": "Menu Approved",
  purchasing: "Purchasing",
  "ready-for-service": "Ready for Service",
  "in-service": "In Service",
  completed: "Completed",
};

export interface OutstandingAction {
  kind: "menu" | "purchasing";
  message: string;
  dueDate: string;
}

export interface WeekStatusInfo {
  weekId: string;
  startDate: string;
  endDate: string;
  phase: WeeklyPhase;
  status: WeekStatus;
  plan: WeeklyPlan | undefined;
  /** Latest non-superseded agent run for the week. */
  run: WorkflowRun | undefined;
  /** Overdue work for a week that is not yet over; never auto-resolved. */
  outstanding: OutstandingAction[];
  /** Informational note for a finished week that was served without weekly sign-off. */
  note: string | null;
}

/** Short Monday–Sunday range, e.g. "Nov 9–15" or "Nov 30 – Dec 6". */
export function weekRange(start: string, end: string) {
  const a = parseDateKey(start);
  const b = parseDateKey(end);
  if (!a || !b) return `${start} – ${end}`;
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()}–${b.getDate()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

const shortDate = (key: string) =>
  parseDateKey(key)?.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? key;

export function weekStatus(s: KitchenState, date: string, reference = new Date()): WeekStatusInfo {
  const startDate = weekStartFor(date);
  const weekId = weeklyPlanId(startDate);
  const plan = s.weeklyPlans?.find((p) => p.id === weekId);
  const latest = latestRunFor(s, weekId);
  const run = latest && latest.status !== "superseded" ? latest : undefined;
  const phase = phaseFor(startDate, reference);
  const today = dateKey(reference);
  const dates = lifecycleDates(startDate, s.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS);
  const menuApproved = plan?.menuStatus === "approved";
  const purchasingApproved = plan?.purchasingStatus === "approved";

  let status: WeekStatus;
  if (menuApproved) {
    if (phase === "completed") status = "completed";
    else if (phase === "service") status = "in-service";
    else if (purchasingApproved) status = "ready-for-service";
    else if (phase === "purchasing" || plan.purchasingStatus !== "not-started")
      status = "purchasing";
    else status = "menu-approved";
  } else if (plan?.menuStatus === "needs-review" || run?.status === "awaiting-approval")
    status = "needs-review";
  else if (plan || run) status = "planning";
  else status = "not-started";

  const outstanding: OutstandingAction[] = [];
  let note: string | null = null;
  if (phase === "completed") {
    if (!menuApproved) note = "Served without a weekly menu approval";
  } else if (!menuApproved) {
    if (today > dates.menuDueDate)
      outstanding.push({
        kind: "menu",
        dueDate: dates.menuDueDate,
        message:
          phase === "service"
            ? `Serving without an approved weekly menu (due ${shortDate(dates.menuDueDate)})`
            : `Menu approval overdue since ${shortDate(dates.menuDueDate)}`,
      });
  } else if (!purchasingApproved && today > dates.purchasingDueDate) {
    outstanding.push({
      kind: "purchasing",
      dueDate: dates.purchasingDueDate,
      message: `Purchase approval overdue since ${shortDate(dates.purchasingDueDate)}`,
    });
  }
  return {
    weekId,
    startDate,
    endDate: addDays(startDate, 6),
    phase,
    status,
    plan,
    run,
    outstanding,
    note,
  };
}

/** The three service weeks active today: serving now, purchasing for next week, planning two weeks out. */
export function rollingServiceWeeks(reference = new Date()) {
  const service = weekStartFor(dateKey(reference));
  return { service, purchasing: addDays(service, 7), planning: addDays(service, 14) };
}

// ---------- Kitchen Pulse workstreams ----------

export interface WorkstreamAlert {
  message: string;
  tone: "danger" | "warn";
  to?: "/approvals" | "/inventory" | "/profile-updates";
  inventoryView?: "delivered" | "incoming";
}

export interface WeeklyWorkstreams {
  service: WeekStatusInfo & {
    served: number;
    today: number;
    remaining: number;
    /** Today's and later meals signed off (individually or by weekly approval). */
    remainingApproved: number;
    alerts: WorkstreamAlert[];
  };
  purchasing: WeekStatusInfo & {
    menuApproved: boolean;
    purchasingStatus: WeeklyPlan["purchasingStatus"];
    /** The Inventory Agent's purchase recommendation for this week, if a run produced one. */
    recommended: { lines: number; total: number; orderByDate: string } | null;
    /** Purchase requests currently waiting in the Approval Center. */
    pendingOrders: number;
    deliveries: { count: number; next: string | null; vendors: string[] };
  };
  planning: WeekStatusInfo & {
    mealsGenerated: number;
    collaboration: string;
    pendingRevisions: number;
    pendingAlternatives: number;
    /** Remaining approval blockers (excluding "not generated"). */
    blockers: number;
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function collaborationLabel(run: WorkflowRun | undefined): string {
  if (!run) return "Agents have not started";
  switch (run.status) {
    case "running":
      return `Step ${Math.min(run.step + 1, WORKFLOW_STEPS)} of ${WORKFLOW_STEPS}: ${WORKFLOW_STEP_LABELS[Math.min(run.step, WORKFLOW_STEPS - 1)]}`;
    case "awaiting-approval":
      return "Checks complete · awaiting your decision";
    case "completed":
      return "Collaboration complete";
    case "stopped":
      return `Stopped: ${run.stopReason ?? "the run did not finish"}`;
    case "superseded":
      return "Agents have not started";
  }
}

export function weeklyWorkstreams(
  s: KitchenState,
  analysis: Pick<Analysis, "proposals">,
  reference = new Date(),
): WeeklyWorkstreams {
  const weeks = rollingServiceWeeks(reference);
  const today = dateKey(reference);

  // Current week — service
  const serviceInfo = weekStatus(s, weeks.service, reference);
  const serviceMenu = weeklyMenu(s, weeks.service, reference);
  const ahead = serviceMenu.slots.filter((x) => x.date >= today);
  const alerts: WorkstreamAlert[] = [];
  const unresolved = ahead.reduce((n, x) => n + x.unresolved, 0);
  if (unresolved)
    alerts.push({
      tone: "danger",
      message: `${plural(unresolved, "resident")} without a safe meal this week`,
      to: "/approvals",
    });
  const alternatives = ahead.reduce((n, x) => n + x.pendingAlternatives, 0);
  if (alternatives)
    alerts.push({
      tone: "warn",
      message: `${plural(alternatives, "resident alternative")} awaiting approval`,
      to: "/approvals",
    });
  const revalidate = ahead.filter((x) => x.needsRevalidation).length;
  if (revalidate)
    alerts.push({
      tone: "warn",
      message: `${plural(revalidate, "meal")} changed since approval and need rechecking`,
    });
  const rejected = ahead.filter((x) => x.rejected).length;
  if (rejected)
    alerts.push({
      tone: "danger",
      message: `${plural(rejected, "rejected meal")} not yet replaced`,
    });
  const dueDeliveries = (s.orders ?? []).filter(
    (o) => o.status === "incoming" && o.deliveryDate <= today,
  ).length;
  if (dueDeliveries)
    alerts.push({
      tone: "warn",
      message: `${dueDeliveries} ${dueDeliveries === 1 ? "delivery" : "deliveries"} arrived and awaiting confirmation`,
      to: "/inventory",
      inventoryView: "delivered",
    });
  const concerns = (s.observations ?? []).filter(
    (o) => o.status === "open" && o.severity === "concern",
  ).length;
  if (concerns)
    alerts.push({
      tone: "danger",
      message: `${plural(concerns, "meal reaction")} needing follow-up`,
    });

  // Next week — purchasing
  const purchasingInfo = weekStatus(s, weeks.purchasing, reference);
  const run = purchasingInfo.run;
  const purchaseEvent = run
    ? (s.agentEvents ?? []).find(
        (e) => e.workflowRunId === run.workflowRunId && e.structuredPayload.kind === "purchase",
      )
    : undefined;
  // Once the menu is approved, the week-specific draft list replaces the agents' early estimate.
  const weekPurchasing =
    purchasingInfo.plan?.menuStatus === "approved"
      ? weeklyPurchasePlan(s, purchasingInfo.plan, reference)
      : null;
  const recommended = weekPurchasing
    ? {
        lines: weekPurchasing.rows.filter((r) => r.shortfall > 0).length,
        total: weekPurchasing.total,
        orderByDate:
          weekPurchasing.proposals
            .map((p) => p.orderByDate ?? "")
            .filter(Boolean)
            .sort()[0] ?? "",
      }
    : purchaseEvent?.structuredPayload.kind === "purchase"
      ? {
          lines: purchaseEvent.structuredPayload.lines.length,
          total: purchaseEvent.structuredPayload.total,
          orderByDate: purchaseEvent.structuredPayload.orderByDate,
        }
      : null;
  const purchasingEnd = addDays(weeks.purchasing, 6);
  const expected = (s.orders ?? [])
    .filter(
      (o) => o.status === "incoming" && o.deliveryDate >= today && o.deliveryDate <= purchasingEnd,
    )
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  // In two weeks — planning
  const planningInfo = weekStatus(s, weeks.planning, reference);
  const planningMenu = weeklyMenu(s, weeks.planning, reference);
  const checks = weeklyApprovalChecks(s, planningInfo.weekId, reference);

  return {
    service: {
      ...serviceInfo,
      served: serviceMenu.slots.filter((x) => x.date < today).length,
      today: serviceMenu.slots.filter((x) => x.date === today).length,
      remaining: ahead.length,
      remainingApproved: ahead.filter((x) => x.approved || x.lock === "approved-week").length,
      alerts,
    },
    purchasing: {
      ...purchasingInfo,
      menuApproved: purchasingInfo.plan?.menuStatus === "approved",
      purchasingStatus: purchasingInfo.plan?.purchasingStatus ?? "not-started",
      recommended,
      pendingOrders:
        analysis.proposals.filter((p) => p.kind === "purchase").length +
        (weekPurchasing?.proposals.length ?? 0),
      deliveries: {
        count: expected.length,
        next: expected[0]?.deliveryDate ?? null,
        vendors: [...new Set(expected.map((o) => o.vendor))],
      },
    },
    planning: {
      ...planningInfo,
      mealsGenerated: planningMenu.slots.filter((x) => x.source === "saved" || x.lock === "past")
        .length,
      collaboration: collaborationLabel(planningInfo.run),
      pendingRevisions:
        planningInfo.run?.status === "awaiting-approval"
          ? pendingRevisions(s, planningInfo.run.workflowRunId).length
          : 0,
      pendingAlternatives: planningMenu.slots.reduce((n, x) => n + x.pendingAlternatives, 0),
      blockers: checks.blockers.filter((b) => b.code !== "approved" && b.code !== "no-review")
        .length,
    },
  };
}

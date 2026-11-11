import { dateKey } from "./schedule";
import type { KitchenState } from "./types";

// Rolling three-week lifecycle for a Monday–Sunday service week starting on S:
//   S−14 … S−8  planning    (generate and approve the seven-day menu)
//   S−7  … S−1  purchasing  (prepare and approve ingredient purchase orders)
//   S    … S+6  service     (prepare and serve the approved 21 meals)
// Phases and deadlines are calendar facts derived from dates. Approval status is a
// separate staff decision: a deadline passing never approves (or un-approves) anything.

export type WeeklyPhase = "upcoming" | "planning" | "purchasing" | "service" | "completed";
export type WeeklyMenuStatus = "not-started" | "generating" | "needs-review" | "approved";
export type WeeklyPurchasingStatus = "not-started" | "draft" | "needs-review" | "approved";

export const WEEKLY_PHASES: WeeklyPhase[] = ["upcoming", "planning", "purchasing", "service", "completed"];
export const WEEKLY_MENU_STATUSES: WeeklyMenuStatus[] = ["not-started", "generating", "needs-review", "approved"];
export const WEEKLY_PURCHASING_STATUSES: WeeklyPurchasingStatus[] = ["not-started", "draft", "needs-review", "approved"];
export const DEFAULT_LEAD_TIME_DAYS = 2;

export interface WeeklyPlan {
  id: string;
  /** Local YYYY-MM-DD, always a Monday. */
  startDate: string;
  /** Local YYYY-MM-DD, always the Sunday after startDate. */
  endDate: string;
  /** Snapshot of phaseFor() at the last write or load; use phaseFor() for live checks. */
  phase: WeeklyPhase;
  menuStatus: WeeklyMenuStatus;
  purchasingStatus: WeeklyPurchasingStatus;
  menuApprovedAt: number | null;
  purchasingApprovedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WeeklyLifecycleDates {
  planningStart: string;
  planningEnd: string;
  menuDueDate: string;
  purchasingStart: string;
  purchasingEnd: string;
  purchasingDueDate: string;
  serviceStart: string;
  serviceEnd: string;
}

// ---------- Local, DST-safe date-key arithmetic ----------

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a local YYYY-MM-DD key at local noon, so DST shifts can never move it to another day. */
export function parseDateKey(key: string): Date | null {
  const match = DATE_KEY.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return dateKey(date) === key ? date : null;
}

export function isDateKey(key: unknown): key is string {
  return typeof key === "string" && parseDateKey(key) !== null;
}

/** Adds calendar days (not 24h blocks) to a date key. */
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  if (!date) throw new Error(`Invalid date key: ${key}`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** Monday on or before the given local date. */
export function weekStartFor(key: string): string {
  const date = parseDateKey(key);
  if (!date) throw new Error(`Invalid date key: ${key}`);
  return addDays(key, -((date.getDay() + 6) % 7));
}

export const weekEndFor = (key: string) => addDays(weekStartFor(key), 6);
export const weeklyPlanId = (startDate: string) => `week-${startDate}`;

// ---------- Lifecycle dates and phase ----------

export function lifecycleDates(startDate: string, leadTimeDays = DEFAULT_LEAD_TIME_DAYS): WeeklyLifecycleDates {
  const start = weekStartFor(startDate);
  const lead = Math.max(0, Math.round(Number.isFinite(leadTimeDays) ? leadTimeDays : DEFAULT_LEAD_TIME_DAYS));
  return {
    planningStart: addDays(start, -14),
    planningEnd: addDays(start, -8),
    menuDueDate: addDays(start, -8),
    purchasingStart: addDays(start, -7),
    purchasingEnd: addDays(start, -1),
    // Approve early enough that deliveries land by the Sunday before service,
    // but never before the purchasing window opens.
    purchasingDueDate: addDays(start, -Math.min(7, 1 + lead)),
    serviceStart: start,
    serviceEnd: addDays(start, 6),
  };
}

export function phaseFor(startDate: string, reference: Date | string = new Date()): WeeklyPhase {
  const today = typeof reference === "string" ? reference : dateKey(reference);
  const start = weekStartFor(startDate);
  if (today < addDays(start, -14)) return "upcoming";
  if (today < addDays(start, -7)) return "planning";
  if (today < start) return "purchasing";
  if (today <= addDays(start, 6)) return "service";
  return "completed";
}

/** True once the whole due date has passed; informational only, never changes status. */
export function isPastDue(dueDate: string, reference: Date | string = new Date()) {
  return (typeof reference === "string" ? reference : dateKey(reference)) > dueDate;
}

/** Whether recorded approvals happened after their deadline (derived, so lead-time changes stay consistent). */
export function approvalTiming(plan: WeeklyPlan, leadTimeDays = DEFAULT_LEAD_TIME_DAYS) {
  const dates = lifecycleDates(plan.startDate, leadTimeDays);
  const lateAfter = (at: number | null, due: string) => at !== null && dateKey(new Date(at)) > due;
  return {
    menuApprovedLate: lateAfter(plan.menuApprovedAt, dates.menuDueDate),
    purchasingApprovedLate: lateAfter(plan.purchasingApprovedAt, dates.purchasingDueDate),
  };
}

// ---------- Records ----------

export function createWeeklyPlan(date: string, reference = new Date()): WeeklyPlan {
  const startDate = weekStartFor(date);
  const now = reference.getTime();
  return {
    id: weeklyPlanId(startDate),
    startDate,
    endDate: addDays(startDate, 6),
    phase: phaseFor(startDate, reference),
    menuStatus: "not-started",
    purchasingStatus: "not-started",
    menuApprovedAt: null,
    purchasingApprovedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface WeeklyStatusChange {
  menuStatus?: WeeklyMenuStatus | undefined;
  purchasingStatus?: WeeklyPurchasingStatus | undefined;
}

/**
 * Applies a staff status change. Returns null when the change is not allowed:
 * purchasing cannot be approved before the menu is approved. Leaving "approved"
 * clears its timestamp; reopening an approved menu sends approved purchasing back to review.
 */
export function applyWeeklyStatus(plan: WeeklyPlan, change: WeeklyStatusChange, reference = new Date()): WeeklyPlan | null {
  if (change.menuStatus !== undefined && !WEEKLY_MENU_STATUSES.includes(change.menuStatus)) return null;
  if (change.purchasingStatus !== undefined && !WEEKLY_PURCHASING_STATUSES.includes(change.purchasingStatus)) return null;
  const now = reference.getTime();
  const menuStatus = change.menuStatus ?? plan.menuStatus;
  let purchasingStatus = change.purchasingStatus ?? plan.purchasingStatus;
  if (purchasingStatus === "approved" && menuStatus !== "approved") {
    if (change.purchasingStatus === "approved") return null;
    purchasingStatus = "needs-review";
  }
  if (menuStatus === plan.menuStatus && purchasingStatus === plan.purchasingStatus) return plan;
  return {
    ...plan,
    phase: phaseFor(plan.startDate, reference),
    menuStatus,
    purchasingStatus,
    menuApprovedAt: menuStatus !== "approved" ? null : plan.menuStatus === "approved" ? plan.menuApprovedAt : now,
    purchasingApprovedAt: purchasingStatus !== "approved" ? null : plan.purchasingStatus === "approved" ? plan.purchasingApprovedAt : now,
    updatedAt: now,
  };
}

export const sortWeeklyPlans = (plans: WeeklyPlan[]) => [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate));
export const weeklyPlanFor = (s: KitchenState, date: string) => isDateKey(date) ? s.weeklyPlans?.find((p) => p.startDate === weekStartFor(date)) : undefined;
export const selectedWeeklyPlan = (s: KitchenState) => s.weeklyPlans?.find((p) => p.id === s.selectedWeekId);

// ---------- Migration ----------

const finiteOr = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const timestampOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Repairs one saved record, or drops it (null) when its week cannot be identified. */
function normalizeWeeklyPlan(raw: unknown, reference: Date): WeeklyPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof WeeklyPlan, unknown>>;
  if (!isDateKey(r.startDate)) return null;
  const startDate = weekStartFor(r.startDate);
  const createdAt = finiteOr(r.createdAt, reference.getTime());
  const menuStatus = WEEKLY_MENU_STATUSES.includes(r.menuStatus as WeeklyMenuStatus) ? r.menuStatus as WeeklyMenuStatus : "not-started";
  let purchasingStatus = WEEKLY_PURCHASING_STATUSES.includes(r.purchasingStatus as WeeklyPurchasingStatus) ? r.purchasingStatus as WeeklyPurchasingStatus : "not-started";
  if (purchasingStatus === "approved" && menuStatus !== "approved") purchasingStatus = "needs-review";
  return {
    id: weeklyPlanId(startDate),
    startDate,
    endDate: addDays(startDate, 6),
    phase: phaseFor(startDate, reference),
    menuStatus,
    purchasingStatus,
    menuApprovedAt: menuStatus === "approved" ? timestampOrNull(r.menuApprovedAt) ?? createdAt : null,
    purchasingApprovedAt: purchasingStatus === "approved" ? timestampOrNull(r.purchasingApprovedAt) ?? createdAt : null,
    createdAt,
    updatedAt: finiteOr(r.updatedAt, createdAt),
  };
}

/**
 * Backward-compatible load step. Older saves get an empty list; existing daily menus,
 * meal approvals and orders are left untouched and are never read as weekly approvals.
 * Safe to run on every load: it only repairs records and refreshes phase snapshots.
 */
export function migrateWeeklyPlans(s: KitchenState, reference = new Date()): KitchenState {
  const byId = new Map<string, WeeklyPlan>();
  for (const raw of Array.isArray(s.weeklyPlans) ? s.weeklyPlans : []) {
    const plan = normalizeWeeklyPlan(raw, reference);
    if (plan && !byId.has(plan.id)) byId.set(plan.id, plan);
  }
  const weeklyPlans = sortWeeklyPlans([...byId.values()]);
  const { selectedWeekId, ...rest } = s;
  return { ...rest, weeklyPlans, ...(selectedWeekId && byId.has(selectedWeekId) ? { selectedWeekId } : {}) };
}

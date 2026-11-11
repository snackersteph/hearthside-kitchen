import { DISHES, dishById } from "./data";
import { analyzeMenuDay, conflictReasons, mealSignature, perServingQty, resolveMenuState } from "./engine";
import { dateKey, scheduledState } from "./schedule";
import { MEALS, type Dish, type KitchenState, type Meal } from "./types";
import { addDays, applyWeeklyStatus, daysBetween, isDateKey, weekStartFor, weeklyPlanId, type WeeklyPlan } from "./weekly-schedule";

// The 21 primary meal slots of a service week, read from and written to the existing
// date-based schedule (scheduledPlans / scheduledOverrides). WeeklyPlan only carries the
// lifecycle; it never stores meals, so every screen resolving a date sees the same menu.

/** Why a slot cannot be generated or regenerated without an explicit revision. */
export type SlotLock = "past" | "approved-week" | "approved-meal";

export interface WeeklyMenuSlot {
  date: string;
  meal: Meal;
  dishId: string;
  dishName: string;
  /** "saved" = staff/generated choice in scheduledPlans; "rotation" = sample-rotation placeholder. */
  source: "saved" | "rotation";
  /** Resident-specific dishes in effect for this slot (explicit overrides plus standing authorizations). */
  overrides: Record<string, string>;
  approved: boolean;
  rejected: boolean;
  lock: SlotLock | null;
  /** Residents served a safe dish right now (main or approved alternative). */
  residentsSafe: number;
  /** Residents whose safe alternative is proposed but awaiting staff approval. */
  pendingAlternatives: number;
  /** Residents with no safe option on file; staff decision needed. */
  unresolved: number;
}

export interface WeeklyMenuDay {
  date: string;
  weekday: string;
  slots: WeeklyMenuSlot[];
}

export interface WeeklyMenu {
  weekId: string;
  startDate: string;
  endDate: string;
  plan: WeeklyPlan | undefined;
  days: WeeklyMenuDay[];
  slots: WeeklyMenuSlot[];
  residentsTotal: number;
  /** Residents with a safe served or proposed dish in all 21 slots. */
  residentsCovered: number;
  savedSlots: number;
  approvedSlots: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const today = (reference: Date) => dateKey(reference);
const offsetOf = (date: string, reference: Date) => daysBetween(today(reference), date);

const findPlan = (s: KitchenState, idOrDate: string) =>
  s.weeklyPlans?.find((p) => p.id === idOrDate) ?? (isDateKey(idOrDate) ? s.weeklyPlans?.find((p) => p.startDate === weekStartFor(idOrDate)) : undefined);

/** Seven days × breakfast/lunch/dinner for the week containing `idOrDate` (a WeeklyPlan id or any date in the week). */
export function weeklyMenu(s: KitchenState, idOrDate: string, reference = new Date()): WeeklyMenu {
  const plan = findPlan(s, idOrDate);
  const startDate = plan?.startDate ?? weekStartFor(idOrDate);
  const blocked = new Set<string>();
  const days = WEEKDAYS.map((weekday, i): WeeklyMenuDay => {
    const date = addDays(startDate, i);
    const offset = offsetOf(date, reference);
    const dayState = resolveMenuState(s, offset, reference);
    const analysis = analyzeMenuDay(s, offset, reference);
    const slots = MEALS.map((meal): WeeklyMenuSlot => {
      const dishId = dayState.plan[meal];
      const approved = s.mealApprovals?.[date]?.[meal]?.signature === mealSignature(dayState, meal);
      const conflicts = analysis.conflicts.filter((c) => c.meal === meal);
      for (const c of conflicts) if (c.status === "needs-staff") blocked.add(c.residentId);
      return {
        date, meal, dishId, dishName: (dishById(dishId) as Dish | undefined)?.name ?? dishId,
        // scheduledState only honours saved plans from today onward.
        source: offset >= 0 && s.scheduledPlans?.[date]?.[meal] ? "saved" : "rotation",
        overrides: { ...dayState.overrides[meal] },
        approved,
        rejected: s.mealRejections?.[date]?.[meal]?.signature === mealSignature(dayState, meal),
        lock: offset < 0 ? "past" : plan?.menuStatus === "approved" ? "approved-week" : approved ? "approved-meal" : null,
        residentsSafe: s.residents.length - conflicts.length,
        pendingAlternatives: conflicts.filter((c) => c.status === "proposal-pending").length,
        unresolved: conflicts.filter((c) => c.status === "needs-staff").length,
      };
    });
    return { date, weekday, slots };
  });
  const slots = days.flatMap((d) => d.slots);
  return {
    weekId: plan?.id ?? weeklyPlanId(startDate), startDate, endDate: addDays(startDate, 6), plan, days, slots,
    residentsTotal: s.residents.length,
    residentsCovered: s.residents.filter((r) => !blocked.has(r.id)).length,
    savedSlots: slots.filter((x) => x.source === "saved").length,
    approvedSlots: slots.filter((x) => x.approved).length,
  };
}

// ---------- Generation ----------

/**
 * Menu Agent choice for one slot: the catalog main that most residents can safely eat,
 * then resident likes and stock on hand, never repeating a dish within the week.
 * Puréed dishes are kept for resident alternatives rather than served as the primary main.
 */
export function chooseDish(s: KitchenState, meal: Meal, used: Map<string, number>, rotation: number, exclude: string[] = []): Dish | undefined {
  const all = DISHES.filter((d) => d.meal === meal && !exclude.includes(d.id));
  const mains = all.filter((d) => !d.tags.includes("pureed"));
  const pool = mains.length ? mains : all;
  if (!pool.length) return undefined;
  const start = ((rotation % pool.length) + pool.length) % pool.length;
  const ordered = [...pool.slice(start), ...pool.slice(0, start)];
  const servings = Math.max(1, s.residents.length);
  let best: Dish | undefined;
  let bestScore = -Infinity;
  for (const dish of ordered) {
    const safe = s.residents.filter((r) => conflictReasons(r, dish).length === 0).length;
    const likes = s.residents.filter((r) => r.likes.some((l) => l.trim() && dish.name.toLowerCase().includes(l.toLowerCase()))).length;
    const stocked = dish.ingredients.every((ing) => {
      const stock = s.ingredients.find((i) => i.id === ing.id);
      return !!stock && stock.stock >= perServingQty(stock.unit, ing.qty, ing.unit) * servings;
    });
    const score = safe * 10 + likes * 2 + (stocked ? 1 : 0) - (used.get(dish.id) ?? 0) * 1000;
    if (score > bestScore) { best = dish; bestScore = score; }
  }
  return best;
}

/** Writes one slot's main into the shared schedule, keeping still-relevant resident alternatives. */
function assignSlot(s: KitchenState, date: string, meal: Meal, dishId: string, reference: Date): KitchenState {
  const offset = offsetOf(date, reference);
  // Explicit alternatives currently in effect (for today this includes legacy same-day overrides).
  const current = scheduledState(s, offset, reference).overrides[meal];
  // Keep alternatives that are still safe and still differ from the new main.
  const kept = Object.fromEntries(Object.entries(current).filter(([residentId, altId]) => {
    const resident = s.residents.find((r) => r.id === residentId);
    const alt = dishById(altId) as Dish | undefined;
    return !!resident && !!alt && alt.meal === meal && alt.id !== dishId && conflictReasons(resident, alt).length === 0;
  }));
  return {
    ...s,
    scheduledPlans: { ...s.scheduledPlans, [date]: { ...s.scheduledPlans?.[date], [meal]: dishId } },
    scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [meal]: kept } },
    mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [meal]: undefined } },
    mealRejections: { ...s.mealRejections, [date]: { ...s.mealRejections?.[date], [meal]: undefined } },
  };
}

function markDrafted(s: KitchenState, planId: string, reference: Date): KitchenState {
  return {
    ...s,
    weeklyPlans: (s.weeklyPlans ?? []).map((p) => {
      if (p.id !== planId) return p;
      const next = p.menuStatus === "not-started" || p.menuStatus === "generating" ? applyWeeklyStatus(p, { menuStatus: "needs-review" }, reference) : p;
      return { ...(next ?? p), updatedAt: reference.getTime() };
    }),
  };
}

const usedDishes = (menu: WeeklyMenu, skip: (slot: WeeklyMenuSlot) => boolean) => {
  const used = new Map<string, number>();
  for (const slot of menu.slots) if (!skip(slot)) used.set(slot.dishId, (used.get(slot.dishId) ?? 0) + 1);
  return used;
};
const rotationFor = (startDate: string, dayIndex: number, meal: Meal) => Math.floor(daysBetween("2026-01-05", startDate) / 7) * 5 + dayIndex * 3 + MEALS.indexOf(meal);

/**
 * Fills every unsaved, unlocked slot of a week from the recipe catalog. Saved menus,
 * approved meals, past days and approved weeks are never overwritten.
 */
export function generateWeeklyMenu(s: KitchenState, planId: string, reference = new Date()): KitchenState {
  const plan = s.weeklyPlans?.find((p) => p.id === planId);
  if (!plan || plan.menuStatus === "approved") return s;
  const menu = weeklyMenu(s, plan.id, reference);
  const open = (slot: WeeklyMenuSlot) => slot.source === "rotation" && slot.lock === null;
  const targets = menu.slots.filter(open);
  if (!targets.length) return s;
  const used = usedDishes(menu, open);
  let next = s;
  for (const slot of targets) {
    const dish = chooseDish(next, slot.meal, used, rotationFor(plan.startDate, daysBetween(plan.startDate, slot.date), slot.meal));
    if (!dish) continue;
    used.set(dish.id, (used.get(dish.id) ?? 0) + 1);
    next = assignSlot(next, slot.date, slot.meal, dish.id, reference);
  }
  return next === s ? s : markDrafted(next, plan.id, reference);
}

/** Replaces one unlocked slot with a different catalog dish; the other 20 slots are untouched. */
export function regenerateWeeklyMeal(s: KitchenState, planId: string, date: string, meal: Meal, reference = new Date()): KitchenState {
  const plan = s.weeklyPlans?.find((p) => p.id === planId);
  if (!plan || !MEALS.includes(meal) || !isDateKey(date) || weekStartFor(date) !== plan.startDate) return s;
  const menu = weeklyMenu(s, plan.id, reference);
  const slot = menu.slots.find((x) => x.date === date && x.meal === meal);
  if (!slot || slot.lock) return s;
  const used = usedDishes(menu, (x) => x === slot);
  const dish = chooseDish(s, meal, used, rotationFor(plan.startDate, daysBetween(plan.startDate, date), meal) + 1, [slot.dishId]);
  if (!dish) return s;
  return markDrafted(assignSlot(s, date, meal, dish.id, reference), plan.id, reference);
}

/**
 * Explicit revision: reopens an approved week (sending approved purchasing back to review)
 * and, when a slot is named, withdraws that meal's sign-off so it can be changed.
 */
export function reviseWeeklyMenu(s: KitchenState, planId: string, slot: { date: string; meal: Meal } | undefined, reference = new Date()): KitchenState {
  const plan = s.weeklyPlans?.find((p) => p.id === planId);
  if (!plan) return s;
  if (slot && (!MEALS.includes(slot.meal) || !isDateKey(slot.date) || weekStartFor(slot.date) !== plan.startDate || slot.date < today(reference))) return s;
  let next = s;
  if (plan.menuStatus === "approved") {
    const reopened = applyWeeklyStatus(plan, { menuStatus: "needs-review" }, reference);
    if (reopened) next = { ...next, weeklyPlans: (next.weeklyPlans ?? []).map((p) => (p.id === plan.id ? reopened : p)) };
  }
  if (slot && next.mealApprovals?.[slot.date]?.[slot.meal]) {
    next = { ...next, mealApprovals: { ...next.mealApprovals, [slot.date]: { ...next.mealApprovals[slot.date], [slot.meal]: undefined } } };
  }
  return next;
}

/**
 * Keeps weekly sign-off honest when staff edit an approved week through existing daily
 * screens: the change itself is the explicit revision, so the week returns to review.
 */
export function reopenApprovedWeekFor(s: KitchenState, date: string | undefined, reference = new Date()): KitchenState {
  if (!date || !isDateKey(date)) return s;
  const plan = s.weeklyPlans?.find((p) => p.startDate === weekStartFor(date));
  return plan && plan.menuStatus === "approved" ? reviseWeeklyMenu(s, plan.id, undefined, reference) : s;
}

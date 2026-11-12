import { DISHES, dishById } from "./data";
import { conflictReasons } from "./engine";
import { dateKey, dayAt } from "./schedule";
import { MEALS, type KitchenState } from "./types";

// One extra day so the profile's 30-day window (which starts 29 days back) is fully covered.
const HISTORY_DAYS = 31;

/**
 * One-time additive seed of past dated staff menus so every resident has meal history.
 * Only fills dates/meals/residents that have no recorded decision; existing staff
 * plans and overrides are never touched. Residents whose requirements conflict with
 * the day's main dish get a compatible alternative recorded as an override.
 */
export function migrateMealHistory(state: KitchenState, reference = new Date()): KitchenState {
  if (state.mealHistoryVersion === 1) return state;
  const scheduledPlans = { ...(state.scheduledPlans ?? {}) };
  const scheduledOverrides = { ...(state.scheduledOverrides ?? {}) };
  for (let ago = HISTORY_DAYS; ago >= 1; ago--) {
    const date = dateKey(dayAt(-ago, reference));
    const plan = { ...(scheduledPlans[date] ?? {}) };
    const dayOverrides = { ...(scheduledOverrides[date] ?? {}) };
    for (const meal of MEALS) {
      const options = DISHES.filter((d) => d.meal === meal);
      if (!options.length) continue;
      const main = plan[meal] ?? options[(ago + MEALS.indexOf(meal)) % options.length]!.id;
      plan[meal] = main;
      const mealOverrides = { ...(dayOverrides[meal] ?? {}) };
      for (const resident of state.residents) {
        if (mealOverrides[resident.id] || !conflictReasons(resident, dishById(main)).length) continue;
        const alternative = options.find((d) => d.id !== main && !conflictReasons(resident, d).length);
        if (alternative) mealOverrides[resident.id] = alternative.id;
      }
      dayOverrides[meal] = mealOverrides;
    }
    scheduledPlans[date] = plan;
    scheduledOverrides[date] = dayOverrides;
  }
  return { ...state, mealHistoryVersion: 1, scheduledPlans, scheduledOverrides };
}

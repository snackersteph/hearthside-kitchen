import type { KitchenState } from "./types";

const RESET_MONTH = "2027-01";

/** True when a service date's month was cleared and menu planning has not started. */
export const isMenuCleared = (state: KitchenState, date: string) => state.clearedMonths?.includes(date.slice(0, 7)) ?? false;

/**
 * One-time reset of January 2027: drops every proposed meal, resident alternative
 * and approval recorded for that month and marks the month as not started, so the
 * calendar and daily menu no longer show generated proposals for it.
 */
export function migrateMenuReset(state: KitchenState): KitchenState {
  if (state.menuResetVersion === 1) return state;
  const dropMonth = <T>(record: Record<string, T> | undefined) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([date]) => !date.startsWith(RESET_MONTH)));
  return {
    ...state,
    menuResetVersion: 1,
    clearedMonths: [...new Set([...(state.clearedMonths ?? []), RESET_MONTH])],
    scheduledPlans: dropMonth(state.scheduledPlans),
    scheduledOverrides: dropMonth(state.scheduledOverrides),
    mealApprovals: dropMonth(state.mealApprovals),
    mealRejections: dropMonth(state.mealRejections),
  };
}

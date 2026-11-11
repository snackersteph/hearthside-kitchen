import type { KitchenState } from "./types";
import { dateKey } from "./schedule";

/** One-time approval archive cleanup; never removes menus, stock or resident choices. */
export function migrateApprovalCleanup(state: KitchenState): KitchenState {
  if (state.approvalCleanupVersion === 1) return state;
  return {
    ...state,
    approvalCleanupVersion: 1,
    history: state.history.filter((decision) => {
      const date = decision.serviceDate ?? dateKey(new Date(decision.at));
      return date >= "2026-11-01";
    }),
  };
}
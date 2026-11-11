import { analyzeMenuDay } from "@/lib/kitchen/engine";
import { dateKey } from "@/lib/kitchen/schedule";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState, SubstitutionProposal } from "@/lib/kitchen/types";
import { addDays, applyWeeklyStatus, daysBetween } from "@/lib/kitchen/weekly-schedule";

/**
 * Test fixture: marks a week's menu approved directly. The app only approves menus through
 * approveWeeklyMenu (which runs the safety checks); lifecycle tests use this shortcut.
 */
export function approveMenuFixture(s: KitchenState, id: string, at: Date): KitchenState {
  return { ...s, weeklyPlans: (s.weeklyPlans ?? []).map((p) => (p.id === id ? applyWeeklyStatus(p, { menuStatus: "approved" }, at) ?? p : p)) };
}

/**
 * Manager action, as in the Approval Center: approve every resident alternative the engine
 * currently proposes for the week's remaining days, using the existing approveSub action.
 */
export function approveAlternatives(s: KitchenState, weekId: string, at: Date): KitchenState {
  const start = weekId.slice(5);
  for (let pass = 0; pass < 5; pass++) {
    const proposals = Array.from({ length: 7 }, (_, i) => addDays(start, i))
      .filter((date) => date > dateKey(at))
      .flatMap((date) => analyzeMenuDay(s, daysBetween(dateKey(at), date), at).proposals)
      .filter((p): p is SubstitutionProposal => p.kind === "substitution");
    if (!proposals.length) break;
    for (const p of proposals) {
      s = reducer(s, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: false, summary: `Approved ${p.serviceDate} ${p.meal} alternative` }, at);
    }
  }
  return s;
}

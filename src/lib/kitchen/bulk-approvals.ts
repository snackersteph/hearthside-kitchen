import { dishById } from "./data";
import { conflictReasons } from "./engine";
import { canApproveMeal } from "./schedule";
import type { reducer } from "./store";
import type { KitchenState, Proposal } from "./types";

/** Revalidate the current selection before using the normal, shared approval actions. */
export function bulkApprovalActions(state: KitchenState, proposals: Proposal[], remember = false, reference = new Date()): Parameters<typeof reducer>[1][] {
  const seen = new Set<string>();
  return proposals.flatMap((p): Parameters<typeof reducer>[1][] => {
    if (seen.has(p.id)) return [];
    seen.add(p.id);
    if (p.kind === "substitution") {
      const dish = dishById(p.dishId);
      if (p.approved || !p.serviceDate || !canApproveMeal(p.serviceDate, reference) || !p.residentIds.length || dish.meal !== p.meal || p.residentIds.some((id) => {
        const resident = state.residents.find((r) => r.id === id);
        return !resident || conflictReasons(resident, dish).length > 0;
      })) return [];
      return [{ type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: true, remember,
        summary: `Approved ${p.serviceDate} ${p.meal} alternative: ${dish.name} for ${p.residentIds.map((id) => state.residents.find((r) => r.id === id)?.name ?? id).join(", ")}` }];
    }
    return [{ type: "approvePurchase", proposalId: p.id, lines: p.lines, modified: false, vendor: p.vendor, ...(p.deliveryDate ? { deliveryDate: p.deliveryDate } : {}), serviceWeekId: p.serviceWeekId,
      summary: `Approved ${p.vendor} order ($${p.total.toFixed(2)})` }];
  });
}
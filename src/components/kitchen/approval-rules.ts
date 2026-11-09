import { dishById } from "@/lib/kitchen/data";
import { conflictReasons, resolveMenuState, type MealReview } from "@/lib/kitchen/engine";
import type { KitchenState, SubstitutionProposal } from "@/lib/kitchen/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

/** Keep accommodation reviews visible even after their alternatives are approved. */
export function needsDietaryReview(state: KitchenState, review: MealReview) {
  const main = dishById(review.mainDishId);
  return state.residents.some((resident) => conflictReasons(resident, main).length > 0);
}

export function approvedAlternatives(state: KitchenState, reviews: MealReview[], reference = new Date()): SubstitutionProposal[] {
  return reviews.flatMap((review) => {
    const day = resolveMenuState(state, differenceInCalendarDays(parseISO(review.serviceDate), reference), reference);
    const groups = new Map<string, string[]>();
    for (const [residentId, dishId] of Object.entries(day.overrides[review.meal])) {
      const resident = state.residents.find((r) => r.id === residentId);
      if (!resident || dishId === review.mainDishId || !conflictReasons(resident, dishById(review.mainDishId)).length || conflictReasons(resident, dishById(dishId)).length) continue;
      groups.set(dishId, [...(groups.get(dishId) ?? []), residentId]);
    }
    return [...groups].map(([dishId, residentIds]) => ({ id: `approved-${review.serviceDate}-${review.meal}-${dishId}-${residentIds.join(".")}`, kind: "substitution" as const, agent: "menu" as const, approved: true, meal: review.meal, fromDishId: review.mainDishId, dishId, residentIds, serviceDate: review.serviceDate, approvalDueDate: review.approvalDueDate,
      reasons: Object.fromEntries(residentIds.map((id) => { const resident = state.residents.find((r) => r.id === id); return [id, resident ? conflictReasons(resident, dishById(review.mainDishId)) : []]; })) }));
  });
}
import { dishById } from "@/lib/kitchen/data";
import { analyzeMenuDay, conflictReasons, resolveMenuState, type MealReview } from "@/lib/kitchen/engine";
import { MEALS, type KitchenState, type SubstitutionProposal } from "@/lib/kitchen/types";
import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { approvalDueDate, dateKey, dayAt } from "@/lib/kitchen/schedule";

/** Calendar and Approval Center count the same dated alternative cards, not main-meal sign-offs. */
export function alternativeOverview(state: KitchenState, reference: Date, dates?: string[]) {
  const today = dateKey(reference);
  const serviceDates = dates ?? Array.from({ length: differenceInCalendarDays(addMonths(reference, 2), reference) }, (_, i) => dateKey(dayAt(i + 1, reference)));
  return serviceDates.map((date) => {
    const offset = differenceInCalendarDays(parseISO(date), reference);
    const result = analyzeMenuDay(state, offset, reference);
    const day = resolveMenuState(state, offset, reference);
    const pending = date > today ? result.proposals.filter((p): p is SubstitutionProposal => p.kind === "substitution") : [];
    const reviews = MEALS.map((meal): MealReview => ({ serviceDate: date, meal, mainDishId: day.plan[meal], approvalDueDate: approvalDueDate(date), signature: "", approved: false, rejected: false, pending: 0, unresolved: 0 }));
    return { date, pending, approved: approvedAlternatives(state, reviews, reference), unresolved: result.conflicts.filter((c) => c.status === "needs-staff") };
  });
}

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
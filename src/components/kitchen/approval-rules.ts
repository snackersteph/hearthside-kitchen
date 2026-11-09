import { dishById } from "@/lib/kitchen/data";
import { conflictReasons, type MealReview } from "@/lib/kitchen/engine";
import type { KitchenState } from "@/lib/kitchen/types";

/** Keep accommodation reviews visible even after their alternatives are approved. */
export function needsDietaryReview(state: KitchenState, review: MealReview) {
  const main = dishById(review.mainDishId);
  return state.residents.some((resident) => conflictReasons(resident, main).length > 0);
}
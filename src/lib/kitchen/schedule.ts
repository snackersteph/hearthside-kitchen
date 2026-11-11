import { DISHES, dishById } from "./data";
import type { KitchenState, Meal } from "./types";

export function dayAt(offset: number, reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function rotatedDish(meal: Meal, offset: number, todayId: string) {
  const options = DISHES.filter((dish) => dish.meal === meal);
  const base = Math.max(0, options.findIndex((dish) => dish.id === todayId));
  return options[((base + offset) % options.length + options.length) % options.length] ?? dishById(todayId);
}

export function scheduledState(state: KitchenState, offset: number, reference = new Date()): KitchenState {
  const date = dateKey(dayAt(offset, reference));
  // Past dates show the menu that was saved for them (what was approved and served), not the sample rotation.
  const saved = state.scheduledPlans?.[date];
  return {
    ...state,
    plan: {
      breakfast: saved?.breakfast ?? rotatedDish("breakfast", offset, state.plan.breakfast).id,
      lunch: saved?.lunch ?? rotatedDish("lunch", offset, state.plan.lunch).id,
      dinner: saved?.dinner ?? rotatedDish("dinner", offset, state.plan.dinner).id,
    },
    overrides: Object.fromEntries((["breakfast", "lunch", "dinner"] as Meal[]).map((meal) => [meal, state.scheduledOverrides?.[date]?.[meal] ?? (offset === 0 && !saved?.[meal] ? state.overrides[meal] : {})])) as KitchenState["overrides"],
    history: offset < 0 ? [] : state.history,
  };
}
export function approvalDueDate(serviceDate: string) {
  return dateKey(dayAt(-1, new Date(`${serviceDate}T12:00:00`)));
}

export function canApproveMeal(serviceDate: string, reference = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) && dateKey(reference) <= approvalDueDate(serviceDate);
}

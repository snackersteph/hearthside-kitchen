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

export function scheduledState(state: KitchenState, offset: number): KitchenState {
  if (offset === 0) return state;
  return {
    ...state,
    plan: {
      breakfast: rotatedDish("breakfast", offset, state.plan.breakfast).id,
      lunch: rotatedDish("lunch", offset, state.plan.lunch).id,
      dinner: rotatedDish("dinner", offset, state.plan.dinner).id,
    },
    overrides: { breakfast: {}, lunch: {}, dinner: {} },
    history: [],
  };
}
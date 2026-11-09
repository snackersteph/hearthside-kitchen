import { DISHES } from "./data";
import { dateKey, dayAt } from "./schedule";
import { MEALS, type KitchenState, type Meal } from "./types";

export interface ResidentMealRecord {
  date: string;
  meal: Meal;
  dishId: string;
  source: "reported" | "recorded-menu";
  reactions: string[];
}

/** Only dated staff records are history; a rotating forecast is not proof of consumption. */
export function residentMealHistory(state: KitchenState, residentId: string, days: number, reference = new Date()): ResidentMealRecord[] {
  if (!state.residents.some((r) => r.id === residentId)) return [];
  const start = dateKey(dayAt(1 - days, reference));
  const end = dateKey(reference);
  const records = new Map<string, ResidentMealRecord>();
  const validDish = (dishId: string, meal: Meal) => DISHES.some((d) => d.id === dishId && d.meal === meal);
  for (const date of new Set([...Object.keys(state.scheduledPlans ?? {}), ...Object.keys(state.scheduledOverrides ?? {})])) {
    if (date < start || date > end) continue;
    for (const meal of MEALS) {
      const dishId = state.scheduledOverrides?.[date]?.[meal]?.[residentId] ?? state.scheduledPlans?.[date]?.[meal];
      if (dishId && validDish(dishId, meal)) records.set(`${date}-${meal}-${dishId}`, { date, meal, dishId, source: "recorded-menu", reactions: [] });
    }
  }
  for (const observation of state.observations ?? []) {
    if (observation.residentId !== residentId || observation.serviceDate < start || observation.serviceDate > end || !validDish(observation.dishId, observation.meal)) continue;
    const key = `${observation.serviceDate}-${observation.meal}-${observation.dishId}`;
    const record = records.get(key) ?? { date: observation.serviceDate, meal: observation.meal, dishId: observation.dishId, source: "reported", reactions: [] };
    records.set(key, { ...record, source: "reported", reactions: [...record.reactions, observation.reaction] });
  }
  return [...records.values()].sort((a, b) => b.date.localeCompare(a.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
}
import { analyzeMenuDay } from "./engine";
import type { KitchenState } from "./types";

const COVERAGE_DAYS = 11;

/** One-time showcase restock; incoming deliveries are never counted as stored food. */
export function migrateInventoryReplenishment(state: KitchenState, reference = new Date()): KitchenState {
  if (state.inventoryReplenishmentVersion === 1) return state;
  let next: KitchenState = { ...state, inventoryReplenishmentVersion: 1 };
  // Stock can influence suggested safe alternatives. Recheck after each increase until
  // the actual projected menu is covered. Quantities only rise, in finite pack steps.
  while (true) {
    const demand: Record<string, number> = {};
    for (let offset = 0; offset < COVERAGE_DAYS; offset++) {
      const day = analyzeMenuDay(next, offset, reference);
      for (const [id, qty] of Object.entries(day.demand)) demand[id] = (demand[id] ?? 0) + qty;
    }
    let changed = false;
    const ingredients = next.ingredients.map((ingredient) => {
      const needed = Math.round((demand[ingredient.id] ?? 0) * 100) / 100;
      if (ingredient.stock >= needed) return ingredient;
      const pack = ingredient.packSize > 0 ? ingredient.packSize : 1;
      const added = Math.ceil((needed - ingredient.stock) / pack) * pack;
      changed = true;
      return { ...ingredient, stock: Math.ceil((ingredient.stock + added) * 100) / 100 };
    });
    if (!changed) return next;
    next = { ...next, ingredients };
  }
}
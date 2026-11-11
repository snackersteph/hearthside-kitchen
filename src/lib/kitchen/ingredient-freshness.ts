import type { Ingredient } from "./types";

/**
 * Planning assumptions for how long a delivery stays usable in the kitchen's storage,
 * in days from delivery. FICTIONAL SAMPLE VALUES for the prototype, not food-safety
 * guidance: staff should confirm them against supplier labels. An ingredient's own
 * `shelfLifeDays` always wins; anything missing from both is flagged, never guessed.
 */
export const ASSUMED_SHELF_LIFE_DAYS: Record<string, number> = {
  salmon: 2,
  shrimp: 2,
  chicken: 3,
  turkey: 3,
  spinach: 4,
  berries: 4,
  bread: 4,
  "gf-bread": 5,
  banana: 5,
  broccoli: 5,
  vegetables: 5,
  milk: 7,
  cream: 7,
  tofu: 7,
  "oat-milk": 7,
  yogurt: 14,
  oranges: 14,
  eggs: 21,
  apples: 21,
  carrots: 21,
  "sweet-potato": 21,
  potatoes: 30,
  butter: 30,
  parmesan: 60,
  garlic: 60,
  peas: 90,
  flour: 180,
  oats: 180,
  pasta: 365,
  "gf-pasta": 365,
  rice: 365,
  quinoa: 365,
  lentils: 365,
  chickpeas: 365,
  "olive-oil": 365,
};

export type ShelfLifeSource = "ingredient" | "assumed" | "missing";

export function shelfLife(
  ingredient: Pick<Ingredient, "id" | "shelfLifeDays"> | undefined,
  id: string,
): { days: number | null; source: ShelfLifeSource } {
  const own = ingredient?.shelfLifeDays;
  if (typeof own === "number" && Number.isFinite(own) && own > 0)
    return { days: Math.round(own), source: "ingredient" };
  const assumed = ASSUMED_SHELF_LIFE_DAYS[id];
  return assumed ? { days: assumed, source: "assumed" } : { days: null, source: "missing" };
}

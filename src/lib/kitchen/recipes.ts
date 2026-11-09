import { DISHES } from "./data";
import type { Allergen, Ingredient, KitchenState, Meal } from "./types";

export type DietGroup = "regular" | "vegetarian" | "vegan";
export const DIET_GROUPS: DietGroup[] = ["regular", "vegetarian", "vegan"];
export type Texture = "regular" | "soft" | "minced" | "pureed";
export const TEXTURES: Texture[] = ["regular", "soft", "minced", "pureed"];
export type RecipeUnit = "g" | "kg" | "ml" | "L" | "each" | "portions" | "slices";

export interface RecipeIngredient { id: string; qty: number; unit: RecipeUnit }
export interface Recipe {
  id: string;
  name: string;
  meal: Meal;
  dietGroup: DietGroup;
  texture: Texture;
  allergens: Allergen[];
  halal: boolean;
  sodiumMg: number;
  ingredients: RecipeIngredient[];
}
export interface Nutrition { calories: number; protein: number; carbs: number; fat: number }

/** Units a recipe may use for an inventory ingredient (metric weights/volumes convert to the stock unit). */
export function unitsFor(stockUnit: string): RecipeUnit[] {
  if (stockUnit === "kg") return ["g", "kg"];
  if (stockUnit === "L") return ["ml", "L"];
  return [stockUnit as RecipeUnit];
}
/** Quantity in the ingredient's stock unit. */
export function toStockUnit(line: RecipeIngredient): number {
  return line.unit === "g" || line.unit === "ml" ? line.qty / 1000 : line.qty;
}

// Approximate nutrition per stock unit (kg, L, each, portion or slice) for estimates.
const PER_UNIT: Record<string, Nutrition> = {
  chicken: { calories: 190, protein: 35, carbs: 0, fat: 4 }, salmon: { calories: 280, protein: 30, carbs: 0, fat: 17 },
  shrimp: { calories: 120, protein: 24, carbs: 1, fat: 2 }, turkey: { calories: 110, protein: 20, carbs: 2, fat: 2 },
  eggs: { calories: 72, protein: 6, carbs: 0, fat: 5 }, milk: { calories: 610, protein: 32, carbs: 48, fat: 33 },
  "oat-milk": { calories: 480, protein: 10, carbs: 66, fat: 15 }, cream: { calories: 3400, protein: 28, carbs: 28, fat: 360 },
  parmesan: { calories: 4300, protein: 380, carbs: 40, fat: 290 }, flour: { calories: 3700, protein: 80, carbs: 760, fat: 40 },
  oats: { calories: 3800, protein: 130, carbs: 670, fat: 65 }, berries: { calories: 500, protein: 7, carbs: 120, fat: 3 },
  bread: { calories: 90, protein: 4, carbs: 17, fat: 1 }, "gf-bread": { calories: 80, protein: 1, carbs: 15, fat: 2 },
  tofu: { calories: 1440, protein: 170, carbs: 30, fat: 87 }, pasta: { calories: 3700, protein: 130, carbs: 750, fat: 15 },
  "gf-pasta": { calories: 3600, protein: 70, carbs: 790, fat: 20 }, vegetables: { calories: 300, protein: 20, carbs: 60, fat: 3 },
  lentils: { calories: 3500, protein: 250, carbs: 600, fat: 10 }, potatoes: { calories: 770, protein: 20, carbs: 170, fat: 1 },
  rice: { calories: 3600, protein: 70, carbs: 800, fat: 6 }, quinoa: { calories: 3700, protein: 140, carbs: 640, fat: 60 },
  banana: { calories: 105, protein: 1, carbs: 27, fat: 0 }, "sweet-potato": { calories: 860, protein: 16, carbs: 200, fat: 1 },
  carrots: { calories: 410, protein: 9, carbs: 96, fat: 2 }, "olive-oil": { calories: 8800, protein: 0, carbs: 0, fat: 1000 },
  garlic: { calories: 1490, protein: 64, carbs: 330, fat: 5 }, butter: { calories: 7200, protein: 9, carbs: 1, fat: 810 },
  spinach: { calories: 230, protein: 29, carbs: 36, fat: 4 }, broccoli: { calories: 340, protein: 28, carbs: 66, fat: 4 },
  peas: { calories: 810, protein: 54, carbs: 145, fat: 4 }, apples: { calories: 520, protein: 3, carbs: 140, fat: 2 },
  oranges: { calories: 470, protein: 9, carbs: 120, fat: 1 }, yogurt: { calories: 610, protein: 35, carbs: 47, fat: 33 },
  chickpeas: { calories: 1640, protein: 89, carbs: 270, fat: 26 },
};
const FALLBACK: Record<string, Nutrition> = {
  kg: { calories: 1500, protein: 60, carbs: 200, fat: 40 }, L: { calories: 500, protein: 20, carbs: 50, fat: 20 },
  each: { calories: 80, protein: 3, carbs: 12, fat: 2 }, portions: { calories: 200, protein: 20, carbs: 10, fat: 8 }, slices: { calories: 80, protein: 3, carbs: 14, fat: 1 },
};

/** Estimated nutrition per serving from the recipe's inventory ingredients. */
export function recipeNutrition(recipe: Recipe, ingredients: Ingredient[]): Nutrition {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const line of recipe.ingredients) {
    const unit = ingredients.find((i) => i.id === line.id)?.unit ?? "kg";
    const per = PER_UNIT[line.id] ?? FALLBACK[unit] ?? FALLBACK.kg!;
    const q = toStockUnit(line);
    total.calories += per.calories * q; total.protein += per.protein * q; total.carbs += per.carbs * q; total.fat += per.fat * q;
  }
  return { calories: Math.round(total.calories), protein: Math.round(total.protein), carbs: Math.round(total.carbs), fat: Math.round(total.fat) };
}

const SEED_SODIUM: Record<string, number> = {
  "b-pancakes": 520, "b-oatmeal": 90, "b-eggs": 480, "b-tofu": 360, "b-smoothie": 60, "l-alfredo": 1180, "l-primavera": 420, "l-lentil": 280,
  "l-club": 1450, "l-puree": 210, "d-salmon": 340, "d-chicken": 560, "d-shrimp": 1120, "d-quinoa": 260, "d-puree": 220, "d-lentil-puree": 240,
};
const NOT_HALAL = new Set(["l-club", "d-shrimp"]); // bacon; white wine
const ANIMAL = new Set(["milk", "cream", "parmesan", "butter", "eggs", "yogurt"]);
const STOCK_UNIT: Record<string, string> = { chicken: "portions", salmon: "portions", shrimp: "portions", turkey: "portions", eggs: "each", banana: "each", bread: "slices", "gf-bread": "slices", milk: "L", "oat-milk": "L", cream: "L", "olive-oil": "L" };

export const SEED_RECIPES: Recipe[] = DISHES.map((d) => ({
  id: d.id, name: d.name, meal: d.meal,
  dietGroup: !d.tags.includes("vegetarian") ? "regular" : d.ingredients.some((i) => ANIMAL.has(i.id)) || d.allergens.some((a) => a === "dairy" || a === "egg") ? "vegetarian" : "vegan",
  texture: d.tags.includes("pureed") ? "pureed" : d.tags.includes("soft") ? "soft" : "regular",
  allergens: [...d.allergens], halal: !NOT_HALAL.has(d.id), sodiumMg: SEED_SODIUM[d.id] ?? 400,
  ingredients: d.ingredients.map((i) => ({ id: i.id, qty: i.unit ? i.qty : i.qty, unit: (i.unit ?? (STOCK_UNIT[i.id] ?? "kg")) as RecipeUnit })),
}));

export function recipeLibrary(state: KitchenState): Recipe[] {
  const deleted = new Set(state.deletedRecipeIds ?? []);
  return [...SEED_RECIPES, ...(state.recipes ?? [])].filter((r) => !deleted.has(r.id));
}

export function isValidRecipe(r: Recipe, ingredients: Ingredient[]): boolean {
  return !!r.name.trim() && ["breakfast", "lunch", "dinner"].includes(r.meal) && DIET_GROUPS.includes(r.dietGroup) && TEXTURES.includes(r.texture)
    && Number.isFinite(r.sodiumMg) && r.sodiumMg >= 0 && r.ingredients.length > 0
    && r.ingredients.every((l) => { const i = ingredients.find((x) => x.id === l.id); return !!i && Number.isFinite(l.qty) && l.qty > 0 && unitsFor(i.unit).includes(l.unit); });
}

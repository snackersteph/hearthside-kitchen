import type { Dish, DishTag, Ingredient, KitchenState, Resident } from "./types";
import { RECIPE_CATALOG } from "./recipe-catalog";
import type { Recipe } from "./recipes";
import { ADDITIONAL_INGREDIENTS } from "./inventory-catalog";

export const INGREDIENTS: Ingredient[] = [
  { id: "chicken", name: "Chicken breast", unit: "portions", stock: 6, onOrder: 0, vendor: "Sysco", packSize: 4, unitCost: 3.2 },
  { id: "salmon", name: "Salmon fillet", unit: "portions", stock: 9, onOrder: 0, vendor: "Pacific Seafood", packSize: 5, unitCost: 5.8 },
  { id: "shrimp", name: "Shrimp", unit: "portions", stock: 4, onOrder: 0, vendor: "Pacific Seafood", packSize: 5, unitCost: 4.5 },
  { id: "turkey", name: "Sliced turkey", unit: "portions", stock: 10, onOrder: 0, vendor: "Sysco", packSize: 10, unitCost: 2.1 },
  { id: "eggs", name: "Eggs", unit: "each", stock: 30, onOrder: 0, vendor: "Valley Farms", packSize: 12, unitCost: 0.35 },
  { id: "milk", name: "Whole milk", unit: "L", stock: 2, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 1.4 },
  { id: "oat-milk", name: "Oat milk", unit: "L", stock: 1, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 2.6 },
  { id: "cream", name: "Heavy cream", unit: "L", stock: 3, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 4.1 },
  { id: "parmesan", name: "Parmesan", unit: "kg", stock: 1, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 18 },
  { id: "flour", name: "Pancake mix", unit: "kg", stock: 4, onOrder: 0, vendor: "Sysco", packSize: 2, unitCost: 2.4 },
  { id: "oats", name: "GF steel-cut oats", unit: "kg", stock: 2, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 4.2 },
  { id: "berries", name: "Mixed berries", unit: "kg", stock: 1.5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 7.5 },
  { id: "bread", name: "Sourdough bread", unit: "slices", stock: 24, onOrder: 0, vendor: "Hearth Bakery", packSize: 20, unitCost: 0.25 },
  { id: "gf-bread", name: "Gluten-free bread", unit: "slices", stock: 4, onOrder: 0, vendor: "Hearth Bakery", packSize: 12, unitCost: 0.55 },
  { id: "tofu", name: "Firm tofu", unit: "kg", stock: 1, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 5 },
  { id: "pasta", name: "Penne pasta", unit: "kg", stock: 5, onOrder: 0, vendor: "Sysco", packSize: 2, unitCost: 2 },
  { id: "gf-pasta", name: "Gluten-free penne", unit: "kg", stock: 0.5, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 4.8 },
  { id: "vegetables", name: "Seasonal vegetables", unit: "kg", stock: 6, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 3.5 },
  { id: "lentils", name: "Red lentils", unit: "kg", stock: 3, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 2.8 },
  { id: "potatoes", name: "Potatoes", unit: "kg", stock: 6, onOrder: 0, vendor: "Valley Farms", packSize: 5, unitCost: 1.2 },
  { id: "rice", name: "Jasmine rice", unit: "kg", stock: 5, onOrder: 0, vendor: "Sysco", packSize: 5, unitCost: 2.2 },
  { id: "quinoa", name: "Quinoa", unit: "kg", stock: 0.6, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 6.5 },
  { id: "banana", name: "Bananas", unit: "each", stock: 20, onOrder: 0, vendor: "Valley Farms", packSize: 12, unitCost: 0.3 },
  { id: "sweet-potato", name: "Sweet potatoes", unit: "kg", stock: 4, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 2.8 },
  { id: "carrots", name: "Carrots", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 1.8 },
  { id: "olive-oil", name: "Olive oil", unit: "L", stock: 2, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 9 },
  { id: "garlic", name: "Garlic", unit: "kg", stock: 0.5, onOrder: 0, vendor: "Valley Farms", packSize: 0.5, unitCost: 6 },
  { id: "butter", name: "Butter", unit: "kg", stock: 1, onOrder: 0, vendor: "Valley Farms", packSize: 0.5, unitCost: 7 },
];

const SUGARY = /pancake|french toast|syrup|compote|cake|muffin|crumble|pudding|cobbler|waffle/i;
/** Daily menus use the main dishes from the recipe library (uploaded catalog). */
export const DISHES: Dish[] = import.meta.hot?.data?.["kitchenDishes"] ?? [];
if (import.meta.hot?.data) import.meta.hot.data["kitchenDishes"] = DISHES;
export function installKitchenCatalog(recipes: Recipe[], residents: Resident[]) {
  RECIPE_CATALOG.splice(0, RECIPE_CATALOG.length, ...recipes);
  RESIDENTS.splice(0, RESIDENTS.length, ...residents);
  const dishes: Dish[] = recipes.filter((r) => (r.category ?? "main") === "main").map((r) => {
  const tags: DishTag[] = [];
  if (r.dietGroup !== "regular") tags.push("vegetarian");
  if (r.texture !== "regular") tags.push("soft");
  if (r.texture === "pureed") tags.push("pureed");
  if (r.sodiumMg >= 900) tags.push("high-sodium");
  if (SUGARY.test(r.name)) tags.push("high-sugar");
  const names = r.ingredients.map((l) => [...INGREDIENTS, ...ADDITIONAL_INGREDIENTS].find((i) => i.id === l.id)?.name ?? l.id);
  return {
    id: r.id, name: r.name, meal: r.meal, allergens: [...r.allergens], tags, halal: r.halal, vegan: r.dietGroup === "vegan",
    description: `${names.join(", ")}. ${r.texture === "regular" ? "Regular" : (r.texture[0] ?? "").toUpperCase() + r.texture.slice(1)} texture, ~${r.sodiumMg} mg sodium${r.halal ? ", halal" : ""}.`,
    ingredients: r.ingredients.map((l) => l.unit === "g" || l.unit === "ml" ? { id: l.id, qty: l.qty, unit: l.unit } : { id: l.id, qty: l.qty }),
  };
});
  DISHES.splice(0, DISHES.length, ...dishes);
}
const LEGACY_IDS: Record<string, string> = {"b-pancakes": "BRK-VEG-01", "b-oatmeal": "BRK-VGN-01", "b-eggs": "BRK-VEG-02", "b-tofu": "BRK-VGN-02", "b-smoothie": "BRK-VGN-03", "l-alfredo": "LUN-REG-01", "l-primavera": "LUN-REG-02", "l-lentil": "LUN-REG-01", "l-club": "LUN-REG-03", "l-puree": "LUN-REG-04", "d-salmon": "DIN-REG-01", "d-chicken": "DIN-REG-02", "d-shrimp": "DIN-REG-03", "d-quinoa": "DIN-VGN-01", "d-puree": "DIN-REG-04", "d-lentil-puree": "DIN-VGN-02"};
/** Map a dish id saved under the old sample menu to its recipe-library equivalent. */
export const currentDishId = (id: string) => (DISHES.some((d) => d.id === id) ? id : LEGACY_IDS[id] ?? id);


export const RESIDENT_PROFILE_VERSION = 1;

export const RESIDENTS: Resident[] = import.meta.hot?.data?.["residentCatalog"] ?? [];
if (import.meta.hot?.data) import.meta.hot.data["residentCatalog"] = RESIDENTS;

/** Mounted providers retain their full table records even if refreshed modules lost their indexes. */
export function restoreKitchenCatalog(state: KitchenState) {
  const saved = state.recipes ?? [];
  installKitchenCatalog([...RECIPE_CATALOG.filter((r) => !saved.some((record) => record.id === r.id)), ...saved], state.residents);
}

export function initialState(): KitchenState {
  return {
    additionalResidentsVersion: 1,
    residentProfileVersion: RESIDENT_PROFILE_VERSION,
    plan: { breakfast: currentDishId("b-pancakes"), lunch: currentDishId("l-alfredo"), dinner: currentDishId("d-salmon") },
    overrides: { breakfast: {}, lunch: {}, dinner: {} },
    residents: RESIDENTS.map((r) => ({ ...r, likes: [...r.likes], allergens: [...r.allergens], diets: [...r.diets], ...(r.careProfile ? { careProfile: { ...r.careProfile } } : {}), ...(r.mealInstructions ? { mealInstructions: [...r.mealInstructions] } : {}) })),
    ingredients: [...INGREDIENTS, ...ADDITIONAL_INGREDIENTS].map((i) => ({ ...i })),
    history: [],
  };
}

export function dishById(id: string): Dish {
  const dish = DISHES.find((d) => d.id === currentDishId(id));
  if (!dish) throw new Error(`Recipe not found: ${id}`);
  return dish;
}

import type { Ingredient } from "./types";

export const FOOD_CATEGORIES = ["Vegetables", "Fruits", "Meat & poultry", "Seafood", "Dairy & eggs", "Grains & bakery", "Plant proteins", "Oils & pantry", "Other"] as const;
export type FoodCategory = typeof FOOD_CATEGORIES[number];
const groups: Record<string, FoodCategory> = {
  vegetables: "Vegetables", potatoes: "Vegetables", "sweet-potato": "Vegetables", carrots: "Vegetables", garlic: "Vegetables", spinach: "Vegetables", broccoli: "Vegetables", peas: "Vegetables",
  berries: "Fruits", banana: "Fruits", apples: "Fruits", oranges: "Fruits",
  chicken: "Meat & poultry", turkey: "Meat & poultry", salmon: "Seafood", shrimp: "Seafood",
  eggs: "Dairy & eggs", milk: "Dairy & eggs", cream: "Dairy & eggs", parmesan: "Dairy & eggs", butter: "Dairy & eggs", yogurt: "Dairy & eggs",
  flour: "Grains & bakery", oats: "Grains & bakery", bread: "Grains & bakery", "gf-bread": "Grains & bakery", pasta: "Grains & bakery", "gf-pasta": "Grains & bakery", rice: "Grains & bakery", quinoa: "Grains & bakery",
  tofu: "Plant proteins", lentils: "Plant proteins", chickpeas: "Plant proteins", "oat-milk": "Plant proteins", "olive-oil": "Oils & pantry",
};
export const ingredientCategory = (ingredient: Ingredient): FoodCategory => ingredient.category ?? groups[ingredient.id] ?? "Other";
export const matchesIngredientSearch = (ingredient: Ingredient, query: string) => `${ingredient.name} ${ingredient.vendor} ${ingredientCategory(ingredient)}`.toLowerCase().includes(query.trim().toLowerCase());
export const ADDITIONAL_INGREDIENTS: Ingredient[] = [
  { id: "spinach", name: "Spinach", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 4 },
  { id: "broccoli", name: "Broccoli", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 3 },
  { id: "peas", name: "Green peas", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 3 },
  { id: "apples", name: "Apples", unit: "kg", stock: 8, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 2.5 },
  { id: "oranges", name: "Oranges", unit: "kg", stock: 8, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 2.5 },
  { id: "yogurt", name: "Plain yogurt", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 4 },
  { id: "chickpeas", name: "Chickpeas", unit: "kg", stock: 5, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 2.8 },
];
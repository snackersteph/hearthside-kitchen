import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { kitchenReducer } from "@/lib/kitchen/store";
import { recipeLibrary, SEED_RECIPES, type Recipe } from "@/lib/kitchen/recipes";

const base = () => structuredClone(initialState);
const recipe = (over: Partial<Recipe> = {}): Recipe => ({ id: "r-test", name: "Test Soup", meal: "lunch", dietGroup: "vegan", texture: "soft", allergens: [], halal: true, sodiumMg: 300, ingredients: [{ id: "carrots", qty: 80, unit: "g" }], ...over });

describe("recipes", () => {
  it("adds a recipe using inventory ingredients", () => {
    const s = kitchenReducer(base(), { type: "addRecipe", recipe: recipe() });
    expect(recipeLibrary(s).some((r) => r.id === "r-test")).toBe(true);
  });
  it("rejects ingredients not in inventory", () => {
    const s = kitchenReducer(base(), { type: "addRecipe", recipe: recipe({ ingredients: [{ id: "unicorn", qty: 1, unit: "kg" }] }) });
    expect(recipeLibrary(s).some((r) => r.id === "r-test")).toBe(false);
  });
  it("rejects a unit that does not match the ingredient stock unit", () => {
    const s = kitchenReducer(base(), { type: "addRecipe", recipe: recipe({ ingredients: [{ id: "carrots", qty: 80, unit: "ml" }] }) });
    expect(recipeLibrary(s).some((r) => r.id === "r-test")).toBe(false);
  });
  it("deletes a built-in recipe", () => {
    const id = SEED_RECIPES[0]!.id;
    const s = kitchenReducer(base(), { type: "deleteRecipe", id });
    expect(recipeLibrary(s).some((r) => r.id === id)).toBe(false);
  });
});

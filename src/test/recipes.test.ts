import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer as kitchenReducer } from "@/lib/kitchen/store";
import { recipeType, recipeAvailability, recipeLibrary, SEED_RECIPES, type Recipe } from "@/lib/kitchen/recipes";

const base = () => initialState();
const recipe = (over: Partial<Recipe> = {}): Recipe => ({ id: "r-test", name: "Test Soup", meal: "lunch", dietGroup: "vegan", texture: "soft", allergens: [], halal: true, sodiumMg: 300, ingredients: [{ id: "carrots", qty: 80, unit: "g" }], ...over });

describe("recipes", () => {
  it("categorizes rice dishes", () => {
    expect(recipeType(recipe({ name: "Salmon Fried Rice" }))).toBe("rice");
    expect(recipeType(recipe({ name: "Vegetable Risotto" }))).toBe("rice");
  });
  it("categorizes soups before their rice ingredient", () => {
    expect(recipeType(recipe({ name: "Chicken & Rice Soup" }))).toBe("soup");
  });
  it("categorizes pasta dishes including penne and Alfredo", () => {
    for (const name of ["Garlic Salmon Pasta", "Vegetable Penne Primavera", "Creamy Chicken Alfredo"]) expect(recipeType(recipe({ name }))).toBe("pasta");
  });
  it("persists staff-selected recipe types without changing main/side/snack", () => {
    const state = kitchenReducer(base(), { type: "addRecipe", recipe: recipe({ recipeType: "rice", category: "side" }) });
    const saved = recipeLibrary(state).find((r) => r.id === "r-test");
    expect(saved?.recipeType).toBe("rice");
    expect(saved?.category).toBe("side");
    expect(saved && recipeType(saved)).toBe("rice");
  });
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
  it("edits a built-in recipe in place", () => {
    const seed = SEED_RECIPES[0]!;
    const s = kitchenReducer(base(), { type: "editRecipe", recipe: { ...seed, name: "Renamed", category: "side" } });
    const lib = recipeLibrary(s);
    expect(lib.filter((r) => r.id === seed.id)).toHaveLength(1);
    expect(lib.find((r) => r.id === seed.id)?.name).toBe("Renamed");
    expect(lib.length).toBe(SEED_RECIPES.length);
  });
  it("imports all 135 uploaded recipes", () => expect(SEED_RECIPES).toHaveLength(135));
  it("converts grams to kg when checking stock", () => {
    const ing = [{ id: "carrots", name: "Carrots", unit: "kg", stock: 0.8, onOrder: 0, vendor: "V", packSize: 1, unitCost: 1 }];
    const r = recipe({ ingredients: [{ id: "carrots", qty: 80, unit: "g" }] });
    expect(recipeAvailability(r, ing, 10).status).toBe("available");
    expect(recipeAvailability(r, ing, 11).status).toBe("low");
    expect(recipeAvailability(r, [{ ...ing[0]!, stock: 0.05 }], 10).status).toBe("unavailable");
  });
});

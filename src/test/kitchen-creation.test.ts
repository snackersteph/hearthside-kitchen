import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyze } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import type { Ingredient, Resident } from "@/lib/kitchen/types";

describe("new kitchen entries", () => {
  const resident: Resident = { id: "new-resident", name: "Test Resident", room: "201", age: 80, allergens: ["dairy"], diets: ["pureed"], likes: [], notes: "" };
  const ingredient: Ingredient = { id: "new-ingredient", name: "Test Flour", unit: "kg", stock: 20, vendor: "Test Supplier", packSize: 2, unitCost: 3, onOrder: 0 };
  it("deletes a resident and their meal choices without changing other records", () => {
    const base = reducer(initialState(), { type: "addResident", resident });
    const state = { ...base,
      overrides: { ...base.overrides, breakfast: { [resident.id]: "b-smoothie", R001: "b-eggs" } },
      scheduledOverrides: { "2026-11-10": { breakfast: { [resident.id]: "b-smoothie", R001: "b-eggs" } } },
      alternativePreferences: [{ residentId: resident.id, meal: "breakfast" as const, fromDishId: "b-pancakes", dishId: "b-smoothie" }],
    };
    const deleted = reducer(state, { type: "deleteResident", id: resident.id });
    expect(deleted.residents).toEqual(base.residents.filter((r) => r.id !== resident.id));
    expect(deleted.overrides.breakfast).toEqual({ R001: "b-eggs" });
    expect(deleted.scheduledOverrides?.["2026-11-10"]?.breakfast).toEqual({ R001: "b-eggs" });
    expect(deleted.alternativePreferences).toEqual([]);
    expect(deleted.history).toEqual(state.history);
    expect(deleted.ingredients).toEqual(state.ingredients);
    expect(analyze(deleted).conflicts.some((c) => c.residentId === resident.id)).toBe(false);
    expect(JSON.parse(JSON.stringify(deleted)).residents.some((r: Resident) => r.id === resident.id)).toBe(false);
  });
  it("leaves state unchanged when deleting a missing resident", () => {
    const state = initialState();
    expect(reducer(state, { type: "deleteResident", id: "missing" })).toBe(state);
  });
  it("adds a resident and immediately includes their dietary requirements in analysis", () => {
    const state = initialState();
    const added = reducer(state, { type: "addResident", resident });
    expect(added.residents).toHaveLength(state.residents.length + 1);
    expect(analyze(added).conflicts.some((c) => c.residentId === resident.id)).toBe(true);
  });
  it("retains an uploaded photo when a new resident is saved and restored", () => {
    const photoUrl = "data:image/webp;base64,dGVzdA==";
    const added = reducer(initialState(), { type: "addResident", resident: { ...resident, photoUrl } });
    const restored = JSON.parse(JSON.stringify(added));
    expect(restored.residents.find((r: Resident) => r.id === resident.id)?.photoUrl).toBe(photoUrl);
  });
  it("adds an inventory row without changing existing rows or inventing incoming stock", () => {
    const state = initialState();
    const added = reducer(state, { type: "addIngredient", ingredient });
    expect(added.ingredients.slice(0, -1)).toEqual(state.ingredients);
    expect(added.ingredients.at(-1)).toEqual(ingredient);
  });
  it("rejects duplicate ingredient names", () => {
    const state = initialState();
    const name = state.ingredients[0]?.name;
    if (!name) throw new Error("Missing ingredient");
    expect(reducer(state, { type: "addIngredient", ingredient: { ...ingredient, name } })).toBe(state);
  });
  it("rejects invalid quantities and unsupported inventory units", () => {
    const state = initialState();
    expect(reducer(state, { type: "addIngredient", ingredient: { ...ingredient, stock: -1 } })).toBe(state);
    expect(reducer(state, { type: "addIngredient", ingredient: { ...ingredient, unit: "lb" } })).toBe(state);
  });
});
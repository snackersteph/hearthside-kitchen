import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { ingredientCategory, matchesIngredientSearch } from "@/lib/kitchen/inventory-catalog";
import { reducer, mergeIngredientCatalog } from "@/lib/kitchen/store";
import { analyze } from "@/lib/kitchen/engine";

describe("inventory catalog changes", () => {
  it("groups vegetables, fruits, meat, and dairy and searches names and vendors", () => {
    const state = initialState();
    const find = (id: string) => { const i = state.ingredients.find((i) => i.id === id); if (!i) throw new Error(id); return i; };
    expect(ingredientCategory(find("carrots"))).toBe("Vegetables");
    expect(ingredientCategory(find("banana"))).toBe("Fruits");
    expect(ingredientCategory(find("chicken"))).toBe("Meat & poultry");
    expect(ingredientCategory(find("milk"))).toBe("Dairy & eggs");
    expect(matchesIngredientSearch(find("carrots"), "CARROT")).toBe(true);
    expect(matchesIngredientSearch(find("carrots"), "Valley Farms")).toBe(true);
    expect(matchesIngredientSearch(find("carrots"), "salmon")).toBe(false);
  });
  it("updates the complete editable ingredient record without changing other items or incoming quantities", () => {
    const state = initialState();
    const i = state.ingredients.find((i) => i.id === "milk");
    if (!i) throw new Error("Missing milk");
    const edited = { ...i, name: "Milk supply", vendor: "New vendor", stock: 8, packSize: 4, unitCost: 2, category: "Other" as const, photoUrl: "data:image/webp;base64,dGVzdA==" };
    const changed = reducer(state, { type: "updateIngredient", ingredient: edited });
    expect(changed.ingredients.find((x) => x.id === i.id)).toEqual(edited);
    expect(changed.ingredients.filter((x) => x.id !== i.id)).toEqual(state.ingredients.filter((x) => x.id !== i.id));
    expect(reducer(state, { type: "updateIngredient", ingredient: { ...i, stock: -1 } })).toBe(state);
    expect(reducer(state, { type: "updateIngredient", ingredient: { ...i, onOrder: 99 } })).toBe(state);
    expect(reducer(state, { type: "updateIngredient", ingredient: { ...i, unit: "kg" } })).toBe(state);
  });
  it("deletes inventory and order lines permanently without hiding missing recipe stock", () => {
    const base = initialState();
    const state = { ...base, orders: [{ id: "order", vendor: "Valley Farms", deliveryDate: "2026-11-12", status: "incoming" as const, lines: [{ ingredientId: "milk", shortage: 1, qty: 2 }, { ingredientId: "carrots", shortage: 1, qty: 2 }] }] };
    const deleted = reducer(state, { type: "deleteIngredient", id: "milk" });
    expect(deleted.ingredients.some((i) => i.id === "milk")).toBe(false);
    expect(deleted.orders?.[0]?.lines).toEqual([{ ingredientId: "carrots", shortage: 1, qty: 2 }]);
    expect(mergeIngredientCatalog(JSON.parse(JSON.stringify(deleted))).ingredients.some((i) => i.id === "milk")).toBe(false);
    expect(analyze(deleted, new Date("2026-11-09T12:00:00")).forecast?.todayShortage.milk).toBeGreaterThan(0);
    expect(deleted.history).toBe(state.history);
  });
});
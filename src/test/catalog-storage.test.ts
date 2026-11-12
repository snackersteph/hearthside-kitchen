import { describe, expect, it } from "vitest";
import { loadKitchenCatalogs, withKitchenCatalogs } from "@/lib/kitchen/catalog-storage";
import { dishById, initialState } from "@/lib/kitchen/data";
import { recipeLibrary } from "@/lib/kitchen/recipes";

describe("dedicated kitchen catalog storage", () => {
  it("loads 135 recipes and 20 complete residents from their separate tables", async () => {
    const catalogs = await loadKitchenCatalogs();
    expect(catalogs.recipes).toHaveLength(135);
    expect(catalogs.residents).toHaveLength(20);
    expect(catalogs.residents.find((r) => r.id === "R012")?.careProfile?.["Texture Requirement"]).toBe("IDDSI Level 4 — Pureed");
    expect(dishById("BRK-REG-01").allergens).toEqual(["egg", "dairy", "gluten"]);
  });
  it("table records replace stale snapshot copies without changing menus or approvals", async () => {
    const catalogs = await loadKitchenCatalogs();
    const original = initialState();
    const next = withKitchenCatalogs({ ...original, residents: [], recipes: [] }, catalogs);
    expect(recipeLibrary(next)).toHaveLength(135);
    expect(next.residents).toHaveLength(20);
    expect(next.plan).toBe(original.plan);
    expect(next.history).toBe(original.history);
  });
  it("hides deleted recipes while retaining their data for historical menus", async () => {
    const catalogs = await loadKitchenCatalogs();
    const next = withKitchenCatalogs(initialState(), { ...catalogs, deletedRecipeIds: ["BRK-REG-01"] });
    expect(recipeLibrary(next).some((r) => r.id === "BRK-REG-01")).toBe(false);
    expect(dishById("BRK-REG-01").name).toBe("Turkey & Egg Sandwich");
  });
});
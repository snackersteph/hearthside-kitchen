import { describe, expect, it } from "vitest";
import { initialState, RESIDENT_PROFILE_VERSION } from "@/lib/kitchen/data";
import { migrateResidentProfiles, migrateAdditionalResidents, reducer } from "@/lib/kitchen/store";
import { compareByFirstName } from "@/routes/residents";

describe("uploaded resident profiles", () => {
  it("loads all 20 uploaded residents with their mapped food requirements", () => {
    const residents = initialState().residents;
    expect(residents).toHaveLength(20);
    expect(residents.find((r) => r.id === "R004")?.careProfile?.["Food Allergies"]).toBe("Oranges, Mangoes");
    expect(residents.find((r) => r.id === "R012")?.diets).toEqual(["pureed"]);
    expect(residents.find((r) => r.id === "R013")).toMatchObject({ allergens: ["shellfish"], diets: ["diabetic", "low-sodium"] });
  });
  it("lists residents alphabetically by first name", () => {
    expect([...initialState().residents].sort(compareByFirstName).slice(0, 4).map((r) => r.name)).toEqual(["Arthur Mitchell", "Bill Parker", "David Kim", "Dorothy Campbell"]);
  });
  it("retains the five new profiles' complete care instructions and mapped allergens", () => {
    const residents = initialState().residents;
    expect(residents.filter((r) => Number(r.id.slice(1)) >= 16).map((r) => r.name)).toEqual(["Dorothy Campbell", "Samuel Brooks", "Grace Nakamura", "Arthur Mitchell", "Evelyn Foster"]);
    expect(residents.find((r) => r.id === "R018")).toMatchObject({ allergens: ["shellfish"], diets: ["low-sodium"], room: "121", age: 79 });
    expect(residents.find((r) => r.id === "R020")).toMatchObject({ allergens: ["egg"], careProfile: { "Diet Type": "Reflux-conscious, individualized" } });
    expect(residents.find((r) => r.id === "R016")?.mealInstructions).toHaveLength(5);
  });
  it("adds the new profiles once without restoring deleted residents or replacing saved edits", () => {
    const base = initialState();
    const saved = { ...base, additionalResidentsVersion: 0, residents: base.residents.filter((r) => r.id !== "R001" && Number(r.id.slice(1)) < 16) };
    const migrated = migrateAdditionalResidents(saved);
    expect(migrated.residents).toHaveLength(19);
    expect(migrated.residents.some((r) => r.id === "R001")).toBe(false);
    expect(migrated.history).toBe(saved.history);
    const deleted = reducer(migrated, { type: "deleteResident", id: "R016" });
    expect(migrateAdditionalResidents(deleted)).toBe(deleted);
  });
  it("replaces outdated saved residents and their resident-specific decisions", () => {
    const old = { ...initialState(), residentProfileVersion: 0, residents: [], alternativePreferences: [{ residentId: "r1", meal: "lunch" as const, fromDishId: "l-alfredo", dishId: "l-primavera" }] };
    const migrated = migrateResidentProfiles(old);
    expect(migrated.residentProfileVersion).toBe(RESIDENT_PROFILE_VERSION);
    expect(migrated.residents).toHaveLength(20);
    expect(migrated.alternativePreferences).toEqual([]);
  });
});

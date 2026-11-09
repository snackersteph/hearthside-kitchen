import { describe, expect, it } from "vitest";
import { initialState, RESIDENT_PROFILE_VERSION } from "@/lib/kitchen/data";
import { migrateResidentProfiles } from "@/lib/kitchen/store";
import { compareByFirstName } from "@/routes/residents";

describe("uploaded resident profiles", () => {
  it("loads all 15 uploaded residents with their mapped food requirements", () => {
    const residents = initialState().residents;
    expect(residents).toHaveLength(15);
    expect(residents.find((r) => r.id === "R004")?.careProfile?.["Food Allergies"]).toBe("Oranges, Mangoes");
    expect(residents.find((r) => r.id === "R012")?.diets).toEqual(["pureed"]);
    expect(residents.find((r) => r.id === "R013")).toMatchObject({ allergens: ["shellfish"], diets: ["diabetic", "low-sodium"] });
  });
  it("lists residents alphabetically by first name", () => {
    expect([...initialState().residents].sort(compareByFirstName).slice(0, 4).map((r) => r.name)).toEqual(["Bill Parker", "David Kim", "Eleanor Davis", "Fatima Hassan"]);
  });
  it("replaces outdated saved residents and their resident-specific decisions", () => {
    const old = { ...initialState(), residentProfileVersion: 0, residents: [], alternativePreferences: [{ residentId: "r1", meal: "lunch" as const, fromDishId: "l-alfredo", dishId: "l-primavera" }] };
    const migrated = migrateResidentProfiles(old);
    expect(migrated.residentProfileVersion).toBe(RESIDENT_PROFILE_VERSION);
    expect(migrated.residents).toHaveLength(15);
    expect(migrated.alternativePreferences).toEqual([]);
  });
});

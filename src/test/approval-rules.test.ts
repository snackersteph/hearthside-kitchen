import { describe, expect, it } from "vitest";
import { needsDietaryReview } from "@/components/kitchen/approval-rules";
import { analyze, mealSignature } from "@/lib/kitchen/engine";
import { initialState } from "@/lib/kitchen/data";

describe("dietary-focused approval visibility", () => {
  const reference = new Date("2026-11-09T12:00:00");
  function breakfast() {
    const review = analyze(initialState(), reference).mealReviews?.find((r) => r.meal === "breakfast");
    if (!review) throw new Error("Missing breakfast review");
    return review;
  }

  it("hides menus without any allergy, intolerance, diet or texture conflict", () => {
    const state = initialState();
    state.residents = state.residents.map((r) => ({ ...r, allergens: [], diets: [] }));
    expect(needsDietaryReview(state, breakfast())).toBe(false);
  });

  it("includes allergy and intolerance accommodations", () => {
    const state = initialState();
    state.residents = [{ id: "allergy", name: "Resident", room: "101", age: 80, allergens: ["dairy"], diets: [], likes: [], notes: "Lactose intolerant" }];
    expect(needsDietaryReview(state, breakfast())).toBe(true);
  });

  it("includes diet and texture accommodations", () => {
    const state = initialState();
    state.residents = [{ id: "texture", name: "Resident", room: "101", age: 80, allergens: [], diets: ["pureed"], likes: [], notes: "" }];
    expect(needsDietaryReview(state, breakfast())).toBe(true);
  });

  it("hides compatible menus even when residents have requirements", () => {
    const state = initialState();
    state.residents = [{ id: "diet", name: "Resident", room: "101", age: 80, allergens: ["dairy"], diets: ["vegetarian", "soft"], likes: [], notes: "" }];
    expect(needsDietaryReview(state, { ...breakfast(), mainDishId: "b-oatmeal" })).toBe(false);
  });

  it("keeps approved accommodations visible after substitutions resolve conflicts", () => {
    const state = initialState();
    state.overrides.breakfast = Object.fromEntries(state.residents.map((r) => [r.id, "b-smoothie"]));
    const review = { ...breakfast(), approved: true, pending: 0, unresolved: 0, signature: mealSignature(state, "breakfast") };
    expect(needsDietaryReview(state, review)).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyze, analyzeMenuDay, dietarySignature } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import { approvedAlternatives } from "@/components/kitchen/approval-rules";

describe("remembered resident alternatives", () => {
  const reference = new Date("2026-11-09T12:00:00");
  function approve(remember: boolean) {
    const state = initialState();
    const proposal = analyzeMenuDay(state, 1, reference).proposals.find((p) => p.kind === "substitution" && p.residentIds.includes("r4"));
    if (!proposal || proposal.kind !== "substitution") throw new Error("Missing purée proposal");
    const action = { type: "approveSub" as const, proposalId: proposal.id, meal: proposal.meal, dishId: proposal.dishId, residentIds: proposal.residentIds, serviceDate: proposal.serviceDate, modified: false, summary: "Approved", remember };
    return { state: reducer(state, action, reference), proposal, action };
  }
  it("does not remember a date-only approval", () => {
    expect(approve(false).state.alternativePreferences).toBeUndefined();
  });
  it("automatically approves a saved choice for the same resident and returning main dish", () => {
    const { state, proposal } = approve(true);
    const resident = state.residents.find((r) => r.id === "r4");
    if (!resident) throw new Error("Missing resident");
    expect(state.alternativePreferences?.find((p) => p.residentId === "r4")).toEqual({ residentId: "r4", meal: proposal.meal, fromDishId: proposal.fromDishId, dishId: proposal.dishId, dietarySignature: dietarySignature(resident) });
    state.scheduledPlans = { ...state.scheduledPlans, "2026-11-11": { [proposal.meal]: proposal.fromDishId } };
    const future = analyzeMenuDay(state, 2, reference);
    expect(future.served[proposal.meal]["r4"]).toBe(proposal.dishId);
    expect(future.conflicts.some((c) => c.meal === proposal.meal && c.residentId === "r4")).toBe(false);
    expect(approvedAlternatives(state, analyze(state, reference).mealReviews ?? [], reference).some((p) => p.serviceDate === "2026-11-11" && p.residentIds.includes("r4") && p.dishId === proposal.dishId)).toBe(true);
    expect(state.scheduledOverrides?.["2026-11-11"]).toBeUndefined();
  });
  it("requires new approval after food requirements change even if the saved dish is still safe", () => {
    const { state, proposal } = approve(true);
    const resident = state.residents.find((r) => r.id === "r4");
    if (!resident) throw new Error("Missing resident");
    const changed = reducer(state, { type: "updateResident", resident: { ...resident, diets: [...resident.diets, "low-sodium"] } }, reference);
    expect(changed.alternativePreferences?.some((p) => p.residentId === "r4")).toBe(false);
    expect(changed.scheduledOverrides?.[proposal.serviceDate ?? ""]?.[proposal.meal]?.["r4"]).toBeUndefined();
    expect(analyzeMenuDay(changed, 1, reference).proposals.some((p) => p.kind === "substitution" && p.meal === proposal.meal && p.residentIds.includes("r4"))).toBe(true);
    expect(approvedAlternatives(changed, analyze(changed, reference).mealReviews ?? [], reference).some((p) => p.serviceDate === proposal.serviceDate && p.meal === proposal.meal && p.residentIds.includes("r4"))).toBe(false);
  });
  it("preserves saved authorization when only the name or notes change", () => {
    const { state } = approve(true);
    const resident = state.residents.find((r) => r.id === "r4");
    if (!resident) throw new Error("Missing resident");
    const changed = reducer(state, { type: "updateResident", resident: { ...resident, name: "Updated name", notes: "Updated note" } }, reference);
    expect(changed.alternativePreferences).toEqual(state.alternativePreferences);
  });
  it("does not restore authorization when requirements change and later change back", () => {
    const { state, proposal } = approve(true);
    const resident = state.residents.find((r) => r.id === "r4");
    if (!resident) throw new Error("Missing resident");
    const changed = reducer(state, { type: "updateResident", resident: { ...resident, diets: [...resident.diets, "low-sodium"] } }, reference);
    const restored = reducer(changed, { type: "updateResident", resident }, reference);
    expect(analyzeMenuDay(restored, 1, reference).conflicts.some((c) => c.residentId === "r4" && c.meal === proposal.meal)).toBe(true);
  });
  it("does not auto-approve legacy remembered choices without a food-requirement signature", () => {
    const { state, proposal } = approve(true);
    state.alternativePreferences = (state.alternativePreferences ?? []).map(({ dietarySignature: _signature, ...p }) => p);
    expect(analyzeMenuDay({ ...state, scheduledOverrides: {} }, 1, reference).conflicts.some((c) => c.residentId === "r4" && c.meal === proposal.meal)).toBe(true);
  });
  it("does not propose remembered choices that became unsafe", () => {
    const state = initialState();
    state.alternativePreferences = [{ residentId: "r1", meal: "lunch", fromDishId: "l-alfredo", dishId: "l-alfredo" }];
    for (const p of analyzeMenuDay(state, 0, reference).proposals) {
      if (p.kind === "substitution" && p.residentIds.includes("r1")) expect(p.dishId).not.toBe("l-alfredo");
    }
  });
  it("shows approved resident alternatives independently of whole-meal sign-off", () => {
    const { state, proposal } = approve(false);
    const approved = approvedAlternatives(state, analyze(state, reference).mealReviews ?? [], reference);
    expect(approved.some((p) => p.serviceDate === proposal.serviceDate && p.dishId === proposal.dishId && p.residentIds.includes("r4"))).toBe(true);
  });
  it("does not save a future preference for an approval past its deadline", () => {
    const { action } = approve(true);
    const state = initialState();
    expect(reducer(state, action, new Date("2026-11-10T12:00:00"))).toBe(state);
  });
});
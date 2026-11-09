import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyze, analyzeMenuDay } from "@/lib/kitchen/engine";
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
  it("remembers a choice for the resident and recurring main dish without future auto-approval", () => {
    const { state, proposal } = approve(true);
    expect(state.alternativePreferences?.find((p) => p.residentId === "r4")).toEqual({ residentId: "r4", meal: proposal.meal, fromDishId: proposal.fromDishId, dishId: proposal.dishId });
    state.scheduledPlans = { ...state.scheduledPlans, "2026-11-11": { [proposal.meal]: proposal.fromDishId } };
    const future = analyzeMenuDay(state, 2, reference).proposals.find((p) => p.kind === "substitution" && p.residentIds.includes("r4") && p.meal === proposal.meal);
    expect(future?.kind === "substitution" ? future.dishId : undefined).toBe(proposal.dishId);
    expect(state.scheduledOverrides?.["2026-11-11"]).toBeUndefined();
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